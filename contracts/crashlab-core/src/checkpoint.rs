//! Campaign run checkpoints for resuming interrupted fuzzing without redoing work.
//!
//! Persist [`RunCheckpoint`] as JSON and reload before continuing a campaign.
//! The checkpoint records the next seed index to process; seeds with indices
//! `< next_seed_index` are treated as already completed.

use crate::CaseSeed;
use serde::{Deserialize, Serialize};

/// Schema version for [`RunCheckpoint`] JSON on disk.
pub const RUN_CHECKPOINT_SCHEMA_VERSION: u32 = 1;

/// Serializable checkpoint for a single campaign run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunCheckpoint {
    /// Format discriminator; bump when fields change meaning.
    pub schema: u32,
    /// Stable identifier for the campaign (caller-defined).
    pub campaign_id: String,
    /// Index into the original seed schedule; seeds `[0..next_seed_index)` are done.
    pub next_seed_index: usize,
    /// Total seeds in the schedule when the checkpoint was written (for validation).
    pub total_seeds: usize,
}

/// Errors when applying a checkpoint to a seed slice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    /// `next_seed_index` is past the end of the provided slice.
    IndexPastEnd {
        next_seed_index: usize,
        seeds_len: usize,
    },
    /// Recorded `total_seeds` does not match `seeds.len()`.
    TotalMismatch { recorded: usize, actual: usize },
}

impl std::fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
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
        }
    }

    /// Seeds still to process, or an error if the checkpoint does not match `seeds`.
    pub fn remaining<'a>(&self, seeds: &'a [CaseSeed]) -> Result<&'a [CaseSeed], CheckpointError> {
        if self.total_seeds != seeds.len() {
            return Err(CheckpointError::TotalMismatch {
                recorded: self.total_seeds,
                actual: seeds.len(),
            });
        }
        if self.next_seed_index > seeds.len() {
            return Err(CheckpointError::IndexPastEnd {
                next_seed_index: self.next_seed_index,
                seeds_len: seeds.len(),
            });
        }
        Ok(&seeds[self.next_seed_index..])
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
pub fn save_run_checkpoint_json(cp: &RunCheckpoint) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec_pretty(cp)
}

/// Parses a checkpoint from JSON bytes.
pub fn load_run_checkpoint_json(bytes: &[u8]) -> Result<RunCheckpoint, serde_json::Error> {
    serde_json::from_slice(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn json_roundtrip() {
        let s = seeds(4);
        let mut cp = RunCheckpoint::new_run("wave3", &s);
        cp.advance_by(2);
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
}
