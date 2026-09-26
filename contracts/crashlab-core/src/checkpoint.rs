//! Campaign run checkpoints for resuming interrupted fuzzing without redoing work.
//!
//! Persist [`RunCheckpoint`] as JSON and reload before continuing a campaign.
//! The checkpoint records two complementary pieces of progress:
//!
//! * `next_seed_index`, the next global seed index a single-worker run should
//!   inspect (v1 behaviour, kept for [`crate::drive_run_from_checkpoint`]); and
//! * `ring_coverage`, the set of fixed-ring slots that have been fully swept by
//!   [`crate::drive_run_partitioned_from_checkpoint`].
//!
//! The ring coverage is what makes worker-count changes safe: a slot's position
//! on the ring is a pure function of the seed index (see
//! [`crate::worker_partition`]), so a resized run can subtract the covered
//! ranges from its new ranges and execute only genuinely unfinished work.
//!
//! ## Schema history
//!
//! * **v1** — `schema`, `campaign_id`, `next_seed_index`, `total_seeds`.
//! * **v2** — adds `ring_coverage`. Missing `ring_coverage` in a v1 file is
//!   read as empty coverage, so existing checkpoints load unchanged and are
//!   upgraded to v2 when written back by [`save_run_checkpoint_json`].

use crate::worker_partition::RingCoverage;
use crate::CaseSeed;
use serde::{Deserialize, Serialize};

/// Current schema version for [`RunCheckpoint`] JSON on disk.
pub const RUN_CHECKPOINT_SCHEMA_VERSION: u32 = 2;

/// Schema versions [`load_run_checkpoint_json`] / [`RunCheckpoint::validate_run`] accept.
///
/// v1 files predate ring coverage; they are accepted and read with empty
/// coverage, then serialized as v2 on the next save.
pub const SUPPORTED_RUN_CHECKPOINT_SCHEMAS: &[u32] = &[1, 2];

/// Serializable checkpoint for a single campaign run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunCheckpoint {
    /// Format discriminator; bump when fields change meaning.
    pub schema: u32,
    /// Stable identifier for the campaign (caller-defined).
    pub campaign_id: String,
    /// Next global seed index a resumed single-worker run should inspect.
    pub next_seed_index: usize,
    /// Total seeds in the schedule when the checkpoint was written (for validation).
    pub total_seeds: usize,
    /// Fixed-ring slots already swept by partitioned workers.
    ///
    /// Defaults to empty when absent, which is exactly how a v1 checkpoint
    /// (written before ring partitioning existed) is interpreted.
    #[serde(default)]
    pub ring_coverage: RingCoverage,
}

/// Errors when applying a checkpoint to a seed slice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    /// Recorded campaign does not match the run being resumed.
    CampaignMismatch { recorded: String, actual: String },
    /// `next_seed_index` is past the end of the provided slice.
    IndexPastEnd {
        next_seed_index: usize,
        seeds_len: usize,
    },
    /// Recorded `total_seeds` does not match `seeds.len()`.
    TotalMismatch { recorded: usize, actual: usize },
    /// The checkpoint was written by an incompatible newer/unknown schema.
    UnsupportedSchema { schema: u32 },
}

impl std::fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CheckpointError::CampaignMismatch { recorded, actual } => write!(
                f,
                "checkpoint campaign_id {recorded:?} does not match requested campaign {actual:?}"
            ),
            CheckpointError::IndexPastEnd {
                next_seed_index,
                seeds_len,
            } => write!(
                f,
                "checkpoint next_seed_index {next_seed_index} is beyond seeds length {seeds_len}"
            ),
            CheckpointError::TotalMismatch { recorded, actual } => write!(
                f,
                "checkpoint total_seeds {recorded} does not match actual schedule length {actual}"
            ),
            CheckpointError::UnsupportedSchema { schema } => write!(
                f,
                "checkpoint schema {schema} is not supported (supported: {supported:?})",
                supported = SUPPORTED_RUN_CHECKPOINT_SCHEMAS
            ),
        }
    }
}

impl std::error::Error for CheckpointError {}

impl RunCheckpoint {
    /// Starts a fresh checkpoint at the beginning of `seeds`.
    pub fn new_run(campaign_id: impl Into<String>, seeds: &[CaseSeed]) -> Self {
        Self {
            schema: RUN_CHECKPOINT_SCHEMA_VERSION,
            campaign_id: campaign_id.into(),
            next_seed_index: 0,
            total_seeds: seeds.len(),
            ring_coverage: RingCoverage::new(),
        }
    }

    /// Seeds still to process, or an error if the checkpoint does not match `seeds`.
    pub fn remaining<'a>(&self, seeds: &'a [CaseSeed]) -> Result<&'a [CaseSeed], CheckpointError> {
        self.validate_run(&self.campaign_id, seeds.len())?;
        Ok(&seeds[self.next_seed_index..])
    }

    /// Upgrades a legacy checkpoint (v1) to the current schema in place.
    ///
    /// v1 files have no ring coverage, which is represented by an empty
    /// [`RingCoverage`]; unknown/newer versions are left untouched so
    /// [`RunCheckpoint::validate_run`] can reject them explicitly.
    pub fn upgrade_schema(&mut self) {
        if self.schema == 1 {
            self.schema = RUN_CHECKPOINT_SCHEMA_VERSION;
        }
    }

    /// Validates that the checkpoint matches the intended campaign and schedule length.
    pub fn validate_run(
        &self,
        campaign_id: &str,
        total_seeds: usize,
    ) -> Result<(), CheckpointError> {
        if !SUPPORTED_RUN_CHECKPOINT_SCHEMAS.contains(&self.schema) {
            return Err(CheckpointError::UnsupportedSchema {
                schema: self.schema,
            });
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

    /// Marks one seed as completed (advances by one).
    pub fn advance_one(&mut self) {
        self.next_seed_index = self.next_seed_index.saturating_add(1);
    }

    /// Marks `n` seeds as completed.
    pub fn advance_by(&mut self, n: usize) {
        self.next_seed_index = self.next_seed_index.saturating_add(n);
    }

    /// True when every seed in the schedule has been processed.
    pub fn is_complete(&self, seeds: &[CaseSeed]) -> bool {
        seeds.len() == self.total_seeds && self.next_seed_index >= self.total_seeds
    }
}

/// Serializes a checkpoint to pretty JSON bytes.
///
/// The persisted document always carries the current schema version, so a v1
/// checkpoint that was loaded and resumed is written back as v2.
pub fn save_run_checkpoint_json(cp: &RunCheckpoint) -> Result<Vec<u8>, serde_json::Error> {
    let mut to_persist = cp.clone();
    to_persist.schema = RUN_CHECKPOINT_SCHEMA_VERSION;
    serde_json::to_vec_pretty(&to_persist)
}

/// Parses a checkpoint from JSON bytes.
///
/// Accepts both v1 and v2 documents. A v1 document has no `ring_coverage` field
/// and deserializes with empty coverage; the returned checkpoint is upgraded to
/// the current schema version.
pub fn load_run_checkpoint_json(bytes: &[u8]) -> Result<RunCheckpoint, serde_json::Error> {
    let mut checkpoint: RunCheckpoint = serde_json::from_slice(bytes)?;
    checkpoint.upgrade_schema();
    Ok(checkpoint)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worker_partition::RingRange;

    fn seeds(n: usize) -> Vec<CaseSeed> {
        (0..n)
            .map(|i| CaseSeed {
                id: i as u64,
                payload: vec![i as u8],
            })
            .collect()
    }

    #[test]
    fn fresh_checkpoint_starts_at_zero() {
        let s = seeds(10);
        let cp = RunCheckpoint::new_run("c1", &s);
        assert_eq!(cp.next_seed_index, 0);
        assert_eq!(cp.total_seeds, 10);
        assert_eq!(cp.schema, RUN_CHECKPOINT_SCHEMA_VERSION);
        assert!(cp.ring_coverage.is_empty());
        assert_eq!(cp.remaining(&s).unwrap().len(), 10);
    }

    #[test]
    fn advance_skips_completed_prefix() {
        let s = seeds(10);
        let mut cp = RunCheckpoint::new_run("c1", &s);
        cp.advance_by(3);
        assert_eq!(cp.remaining(&s).unwrap().len(), 7);
        assert_eq!(cp.remaining(&s).unwrap()[0].id, 3);
    }

    #[test]
    fn resume_does_not_reprocess_completed() {
        let s = seeds(5);
        let mut cp = RunCheckpoint::new_run("c1", &s);
        cp.advance_by(3);
        let rest = cp.remaining(&s).unwrap();
        let ids: Vec<u64> = rest.iter().map(|x| x.id).collect();
        assert_eq!(ids, vec![3, 4]);
    }

    #[test]
    fn total_mismatch_errors() {
        let s = seeds(5);
        let mut cp = RunCheckpoint::new_run("c1", &s);
        cp.total_seeds = 99;
        assert!(matches!(
            cp.remaining(&s),
            Err(CheckpointError::TotalMismatch { .. })
        ));
    }

    #[test]
    fn validate_run_rejects_campaign_mismatch() {
        let s = seeds(5);
        let cp = RunCheckpoint::new_run("c1", &s);
        assert!(matches!(
            cp.validate_run("c2", s.len()),
            Err(CheckpointError::CampaignMismatch { .. })
        ));
    }

    #[test]
    fn json_roundtrip() {
        let s = seeds(4);
        let mut cp = RunCheckpoint::new_run("wave4", &s);
        cp.advance_by(2);
        cp.ring_coverage.mark_slot(7);
        let bytes = save_run_checkpoint_json(&cp).unwrap();
        let loaded = load_run_checkpoint_json(&bytes).unwrap();
        assert_eq!(loaded, cp);
    }

    #[test]
    fn is_complete_when_fully_advanced() {
        let s = seeds(3);
        let mut cp = RunCheckpoint::new_run("c", &s);
        cp.advance_by(3);
        assert!(cp.is_complete(&s));
    }

    // ── v1 read compatibility ────────────────────────────────────────────────

    #[test]
    fn v1_checkpoint_loads_with_empty_coverage_and_upgrades() {
        let v1 = br#"{
            "schema": 1,
            "campaign_id": "campaign-v1",
            "next_seed_index": 2,
            "total_seeds": 5
        }"#;

        let loaded = load_run_checkpoint_json(v1).expect("v1 checkpoint must load");
        assert_eq!(loaded.schema, RUN_CHECKPOINT_SCHEMA_VERSION);
        assert!(loaded.ring_coverage.is_empty());
        assert_eq!(loaded.next_seed_index, 2);
        loaded
            .validate_run("campaign-v1", 5)
            .expect("v1 checkpoint remains valid after upgrade");
    }

    #[test]
    fn saving_a_v1_checkpoint_writes_the_current_schema() {
        let s = seeds(3);
        let mut cp = RunCheckpoint::new_run("c", &s);
        cp.schema = 1;

        let bytes = save_run_checkpoint_json(&cp).unwrap();
        let raw: RunCheckpoint = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(raw.schema, RUN_CHECKPOINT_SCHEMA_VERSION);
        assert!(raw.ring_coverage.is_empty());
    }

    #[test]
    fn unsupported_schema_is_rejected() {
        let s = seeds(2);
        let mut cp = RunCheckpoint::new_run("c", &s);
        cp.schema = 99;
        assert_eq!(
            cp.validate_run("c", 2),
            Err(CheckpointError::UnsupportedSchema { schema: 99 })
        );
    }

    #[test]
    fn ring_coverage_survives_json_roundtrip() {
        let s = seeds(4);
        let mut cp = RunCheckpoint::new_run("c", &s);
        cp.ring_coverage.mark_range(RingRange::new(10, 20));
        cp.ring_coverage.mark_slots(vec![25, 26, 27]);
        cp.ring_coverage.mark_range(RingRange::new(40, 41));

        let bytes = save_run_checkpoint_json(&cp).unwrap();
        let loaded = load_run_checkpoint_json(&bytes).unwrap();
        assert_eq!(loaded.ring_coverage, cp.ring_coverage);
        assert_eq!(loaded.ring_coverage.covered_slot_count(), 14);
    }
}
