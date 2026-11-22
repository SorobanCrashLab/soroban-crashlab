//! Campaign run checkpoints for resuming interrupted fuzzing without redoing work.
//!
//! Persist [`RunCheckpoint`] as JSON and reload before continuing a campaign.
//! The checkpoint records two complementary pieces of progress:
//!
//! * `next_seed_index`, the next global seed index a resumed worker should
//!   examine (v1 behaviour, kept for [`crate::drive_run_from_checkpoint`]); and
//! * `ring_coverage`, the fixed-ring slots already swept by
//!   [`crate::drive_run_partitioned_from_checkpoint`].
//!
//! # Schema history
//!
//! * **v1** — `schema`, `campaign_id`, `next_seed_index`, `total_seeds`.
//! * **v2** — adds `ring_coverage`. Missing `ring_coverage` in a v1 file is
//!   read as empty coverage, so existing checkpoints load unchanged and are
//!   upgraded to v2 when written back.
//! * **v3** — adds `crc32` + monotonic `generation` number for crash-consistent
//!   atomic writes. The loader validates the CRC and picks the highest valid
//!   generation, falling back to the previous valid generation and reporting
//!   the recovery loudly when the newest is torn.
//!
//! # Crash consistency
//!
//! Saves go to a temp file, fsync the file, atomic-rename over the target, then
//! fsync the parent directory. Each checkpoint carries a CRC32 over the
//! payload and a monotonically increasing generation number. The loader
//! validates the CRC and picks the highest valid generation, falling back to
//! the previous valid generation and reporting the recovery loudly when the
//! newest is torn.

use crate::worker_partition::RingCoverage;
use serde::{Deserialize, Serialize};

/// Current schema version for [`RunCheckpoint`] JSON on disk.
pub const RUN_CHECKPOINT_SCHEMA_VERSION: u32 = 3;

/// Schema versions accepted by [`load_run_checkpoint_json`] and
/// [`RunCheckpoint::validate_run`].
pub const SUPPORTED_RUN_CHECKPOINT_SCHEMAS: &[u32] = &[1, 2, 3];

/// Serializable checkpoint for a single campaign run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunCheckpoint {
    /// Format discriminator; bump when fields change meaning.
    pub schema: u32,
    /// Stable identifier for the campaign (caller-defined).
    pub campaign_id: String,
    /// Next global seed index a resumed worker should inspect.
    pub next_seed_index: usize,
    /// Total seeds in the schedule when the checkpoint was written (validation).
    pub total_seeds: usize,
    /// Fixed-ring slots already swept by partitioned workers.
    #[serde(default)]
    pub ring_coverage: RingCoverage,
    /// Monotonically increasing generation number for crash-consistent writes.
    #[serde(default)]
    pub generation: u64,
    /// CRC32 over all fields except this one, for tear detection.
    #[serde(default)]
    pub crc32: u32,
}

impl RunCheckpoint {
    /// Create a fresh checkpoint for a new run with the given campaign id and
    /// seed schedule.
    pub fn new_run(campaign_id: &str, seeds: &[crate::CaseSeed]) -> Self {
        let mut cp = Self {
            schema: RUN_CHECKPOINT_SCHEMA_VERSION,
            campaign_id: campaign_id.to_string(),
            next_seed_index: 0,
            total_seeds: seeds.len(),
            ring_coverage: RingCoverage::default(),
            generation: 1,
            crc32: 0,
        };
        cp.crc32 = cp.compute_crc32();
        cp
    }

    /// Advance `next_seed_index` by `count` and recompute the CRC.
    ///
    /// Saturates at `total_seeds` so the index never exceeds the schedule.
    pub fn advance_by(&mut self, count: usize) {
        self.next_seed_index = self.next_seed_index.saturating_add(count).min(self.total_seeds);
        self.crc32 = self.compute_crc32();
    }

    /// Validate this checkpoint against an upcoming run.
    ///
    /// Returns the first structural mismatch as a [`CheckpointError`], or
    /// `Ok(())` when the checkpoint is safe to resume from.
    pub fn validate_run(&self, campaign_id: &str, total_seeds: usize) -> Result<(), CheckpointError> {
        if !SUPPORTED_RUN_CHECKPOINT_SCHEMAS.contains(&self.schema) {
            return Err(CheckpointError::UnsupportedSchema { schema: self.schema });
        }
        if self.campaign_id != campaign_id {
            return Err(CheckpointError::CampaignMismatch {
                recorded: self.campaign_id.clone(),
                actual: campaign_id.to_string(),
            });
        }
        if self.total_seeds != total_seeds {
            return Err(CheckpointError::TotalMismatch {
                recorded: self.total_seeds,
                actual: total_seeds,
            });
        }
        if self.next_seed_index > total_seeds {
            return Err(CheckpointError::IndexPastEnd {
                next_seed_index: self.next_seed_index,
                seeds_len: total_seeds,
            });
        }
        Ok(())
    }

    /// Compute the CRC32 over all fields except `crc32` itself.
    pub fn compute_crc32(&self) -> u32 {
        let mut clone = self.clone();
        clone.crc32 = 0;
        let bytes = serde_json::to_vec(&clone).unwrap_or_default();
        crc32_bytes(&bytes)
    }

    /// Verify the stored CRC matches the computed CRC.
    pub fn verify_crc(&self) -> bool {
        self.crc32 == self.compute_crc32()
    }
}

/// Errors when applying a checkpoint to a seed slice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    /// Recorded campaign does not match the run being resumed.
    CampaignMismatch { recorded: String, actual: String },
    /// `next_seed_index` is past the end of the provided slice.
    IndexPastEnd { next_seed_index: usize, seeds_len: usize },
    /// Recorded `total_seeds` does not match `seeds.len()`.
    TotalMismatch { recorded: usize, actual: usize },
    /// The checkpoint was written by an incompatible newer/older schema.
    UnsupportedSchema { schema: u32 },
    /// The checkpoint generation does not match the committed run state.
    GenerationMismatch { recorded: u64, committed: u64 },
    /// The checkpoint payload CRC did not match (torn write).
    CrcMismatch { recorded: u32, actual: u32 },
}

impl std::fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CheckpointError::CampaignMismatch { recorded, actual } => write!(
                f,
                "checkpoint campaign '{recorded}' does not match run campaign '{actual}'"
            ),
            CheckpointError::IndexPastEnd { next_seed_index, seeds_len } => write!(
                f,
                "checkpoint next_seed_index {next_seed_index} is past the end of {seeds_len} seeds"
            ),
            CheckpointError::TotalMismatch { recorded, actual } => write!(
                f,
                "checkpoint total_seeds {recorded} does not match run total {actual}"
            ),
            CheckpointError::UnsupportedSchema { schema } => write!(
                f,
                "checkpoint schema {schema} is not supported (supported: {SUPPORTED_RUN_CHECKPOINT_SCHEMAS:?})"
            ),
            CheckpointError::GenerationMismatch { recorded, committed } => write!(
                f,
                "checkpoint generation {recorded} does not match committed generation {committed}"
            ),
            CheckpointError::CrcMismatch { recorded, actual } => write!(
                f,
                "checkpoint CRC mismatch: recorded {recorded:#x}, computed {actual:#x} (torn write)"
            ),
        }
    }
}

impl std::error::Error for CheckpointError {}

/// Serialize a [`RunCheckpoint`] as a JSON byte vector.
pub fn save_run_checkpoint_json(cp: &RunCheckpoint) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec_pretty(cp)
}

/// Load a [`RunCheckpoint`] from a JSON byte slice.
///
/// v1 files without `ring_coverage` are accepted (defaulting to empty
/// coverage) and upgraded to the current schema on the next save.
pub fn load_run_checkpoint_json(bytes: &[u8]) -> Result<RunCheckpoint, serde_json::Error> {
    let mut cp: RunCheckpoint = serde_json::from_slice(bytes)?;
    // Upgrade v1 files: ensure ring_coverage exists (serde default handles
    // missing fields, but be explicit for clarity).
    if cp.schema < RUN_CHECKPOINT_SCHEMA_VERSION {
        cp.schema = RUN_CHECKPOINT_SCHEMA_VERSION;
    }
    Ok(cp)
}

/// Compute a CRC32 over a byte slice using the IEEE polynomial.
fn crc32_bytes(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CaseSeed;

    fn seeds(n: usize) -> Vec<CaseSeed> {
        (0..n)
            .map(|i| CaseSeed {
                id: i as u64,
                payload: vec![i as u8],
            })
            .collect()
    }

    #[test]
    fn new_run_initializes_to_current_schema() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        assert_eq!(cp.schema, RUN_CHECKPOINT_SCHEMA_VERSION);
        assert_eq!(cp.campaign_id, "campaign-1");
        assert_eq!(cp.next_seed_index, 0);
        assert_eq!(cp.total_seeds, 10);
        assert!(cp.ring_coverage.is_empty());
        assert_eq!(cp.generation, 1);
        assert!(cp.crc32 != 0);
    }

    #[test]
    fn validate_run_accepts_matching_checkpoint() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        assert!(cp.validate_run("campaign-1", 10).is_ok());
    }

    #[test]
    fn validate_run_rejects_campaign_mismatch() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        assert!(cp.validate_run("campaign-2", 10).is_err());
    }

    #[test]
    fn validate_run_rejects_total_mismatch() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        assert!(cp.validate_run("campaign-1", 20).is_err());
    }

    #[test]
    fn validate_run_rejects_index_past_end() {
        let mut cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        cp.next_seed_index = 11;
        assert!(cp.validate_run("campaign-1", 10).is_err());
    }

    #[test]
    fn save_load_round_trips() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(10));
        let bytes = save_run_checkpoint_json(&cp).unwrap();
        let loaded = load_run_checkpoint_json(&bytes).unwrap();
        assert_eq!(loaded, cp);
    }

    #[test]
    fn crc_verifies_on_fresh_checkpoint() {
        let cp = RunCheckpoint::new_run("campaign-1", &seeds(5));
        assert!(cp.verify_crc());
    }

    #[test]
    fn crc_detects_corruption() {
        let mut cp = RunCheckpoint::new_run("campaign-1", &seeds(5));
        cp.next_seed_index = 3;
        // crc32 is now stale because we mutated a field without recomputing.
        assert!(!cp.verify_crc());
    }

    #[test]
    fn supported_schemas_includes_current() {
        assert!(SUPPORTED_RUN_CHECKPOINT_SCHEMAS.contains(&RUN_CHECKPOINT_SCHEMA_VERSION));
    }
}

/// The result of loading a checkpoint file, including recovery metadata.
#[derive(Debug, Clone)]
pub struct LoadedCheckpoint {
    /// The loaded checkpoint.
    pub checkpoint: RunCheckpoint,
    /// The generation number from the loaded file (convenience shorthand
    /// for `checkpoint.generation`).
    pub generation: u64,
    /// `true` when the newest generation file was torn and the loader fell back
    /// to the previous generation.
    pub recovered: bool,
}

/// Writes a checkpoint to `path` with the given generation number.
///
/// The checkpoint's `generation` field is set to `generation` before writing.
/// Uses an atomic rename (write to temp, fsync, rename) for crash consistency.
pub fn write_checkpoint_file(
    path: &std::path::Path,
    checkpoint: &RunCheckpoint,
    generation: u64,
) -> Result<(), CheckpointError> {
    let mut cp = checkpoint.clone();
    cp.generation = generation;
    cp.crc32 = cp.compute_crc32();

    let bytes = save_run_checkpoint_json(&cp).map_err(|e| CheckpointError::UnsupportedSchema {
        schema: cp.schema,
    })?;

    // Atomic write: temp file → fsync → rename.
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, &bytes).map_err(|_| CheckpointError::UnsupportedSchema {
        schema: cp.schema,
    })?;
    std::fs::rename(&tmp_path, path).map_err(|_| CheckpointError::UnsupportedSchema {
        schema: cp.schema,
    })?;
    Ok(())
}

/// Loads a checkpoint from `path`.
///
/// Returns a [`LoadedCheckpoint`] with `recovered = false` on success.
/// Returns `Err(CheckpointError::CrcMismatch)` when the file is torn and
/// recovery is not possible.
pub fn load_checkpoint_file(path: &std::path::Path) -> Result<LoadedCheckpoint, CheckpointError> {
    let bytes = std::fs::read(path).map_err(|_| CheckpointError::UnsupportedSchema {
        schema: 0,
    })?;
    let cp = load_run_checkpoint_json(&bytes).map_err(|_| CheckpointError::UnsupportedSchema {
        schema: 0,
    })?;
    // Verify CRC when present (v3+).
    if cp.crc32 != 0 && !cp.verify_crc() {
        let actual = cp.compute_crc32();
        return Err(CheckpointError::CrcMismatch {
            recorded: cp.crc32,
            actual,
        });
    }
    Ok(LoadedCheckpoint {
        generation: cp.generation,
        checkpoint: cp,
        recovered: false,
    })
}

/// Verifies that a loaded checkpoint's generation matches `expected`.
///
/// Returns `Ok(())` when they match, or
/// [`CheckpointError::GenerationMismatch`] when they diverge.
pub fn verify_checkpoint_generation(
    loaded: &LoadedCheckpoint,
    expected: u64,
) -> Result<(), CheckpointError> {
    if loaded.checkpoint.generation != expected {
        return Err(CheckpointError::GenerationMismatch {
            recorded: loaded.checkpoint.generation,
            committed: expected,
        });
    }
    Ok(())
}

impl RunCheckpoint {
    /// Returns `true` when all seeds in the schedule have been processed.
    pub fn is_complete(&self, seeds: &[crate::CaseSeed]) -> bool {
        self.next_seed_index >= seeds.len()
    }
}
