//! Configurable retention policies for run artifacts.
//!
//! Apply retention windows to prune old non-critical data while preserving
//! the latest failures and essential checkpoints.

use crate::{CaseBundleDocument, RunCheckpoint};
use std::collections::HashMap;

/// Configuration for artifact retention policies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionPolicy {
    /// Maximum number of failure bundles to retain (keep the most recent by seed ID).
    pub max_failure_bundles: usize,
    /// Maximum number of checkpoints to retain per campaign (keep the most advanced).
    pub max_checkpoints_per_campaign: usize,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            max_failure_bundles: 100,
            max_checkpoints_per_campaign: 5,
        }
    }
}

impl RetentionPolicy {
    /// Returns a vector of booleans indicating which bundles to retain (true = keep).
    ///
    /// Retains the `max_failure_bundles` most recent failures, sorted by descending seed ID.
    pub fn retain_failure_bundles(&self, bundles: &[CaseBundleDocument]) -> Vec<bool> {
        let mut indices: Vec<usize> = (0..bundles.len()).collect();
        indices.sort_by_key(|&i| std::cmp::Reverse(bundles[i].seed.id));
        let mut keep = vec![false; bundles.len()];
        for &i in indices.iter().take(self.max_failure_bundles) {
            keep[i] = true;
        }
        keep
    }

    /// Returns a vector of booleans indicating which checkpoints to retain (true = keep).
    ///
    /// For each campaign, retains up to `max_checkpoints_per_campaign` checkpoints
    /// with the highest `next_seed_index` (most advanced).
    pub fn retain_checkpoints(&self, checkpoints: &[RunCheckpoint]) -> Vec<bool> {
        let mut campaign_checkpoints: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
        for (i, ck) in checkpoints.iter().enumerate() {
            campaign_checkpoints
                .entry(ck.campaign_id.clone())
                .or_default()
                .push((i, ck.next_seed_index));
        }
        let mut keep = vec![false; checkpoints.len()];
        for (_campaign, mut cks) in campaign_checkpoints {
            // Sort by next_seed_index descending
            cks.sort_by_key(|&(_, idx)| std::cmp::Reverse(idx));
            // Keep the top max_checkpoints_per_campaign
            for &(i, _) in cks.iter().take(self.max_checkpoints_per_campaign) {
                keep[i] = true;
            }
        }
        keep
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseBundleDocument, CaseSeed, CrashSignature, FailureClass, RunCheckpoint};

    #[test]
    fn test_retain_failure_bundles() {
        let policy = RetentionPolicy {
            max_failure_bundles: 2,
            max_checkpoints_per_campaign: 1,
        };

        let bundles = vec![
            CaseBundleDocument {
                schema: 1,
                seed: CaseSeed {
                    id: 1,
                    payload: vec![1],
                },
                signature: CrashSignature {
                    category: FailureClass::Auth.to_string(),
                    digest: 1,
                    signature_hash: 1,
                },
                environment: None,
                failure_payload: vec![],
                rpc_envelope: None,
            },
            CaseBundleDocument {
                schema: 1,
                seed: CaseSeed {
                    id: 3,
                    payload: vec![3],
                },
                signature: CrashSignature {
                    category: FailureClass::Budget.to_string(),
                    digest: 3,
                    signature_hash: 3,
                },
                environment: None,
                failure_payload: vec![],
                rpc_envelope: None,
            },
            CaseBundleDocument {
                schema: 1,
                seed: CaseSeed {
                    id: 2,
                    payload: vec![2],
                },
                signature: CrashSignature {
                    category: FailureClass::State.to_string(),
                    digest: 2,
                    signature_hash: 2,
                },
                environment: None,
                failure_payload: vec![],
                rpc_envelope: None,
            },
        ];

        let keep = policy.retain_failure_bundles(&bundles);
        assert_eq!(keep, vec![false, true, true]); // keep id 3 and 2 (highest), not 1
    }

    #[test]
    fn test_retain_checkpoints() {
        let policy = RetentionPolicy {
            max_failure_bundles: 1,
            max_checkpoints_per_campaign: 1,
        };

        let checkpoints = vec![
            RunCheckpoint {
                schema: 1,
                campaign_id: "camp1".to_string(),
                next_seed_index: 10,
                total_seeds: 100,
            },
            RunCheckpoint {
                schema: 1,
                campaign_id: "camp1".to_string(),
                next_seed_index: 20,
                total_seeds: 100,
            },
            RunCheckpoint {
                schema: 1,
                campaign_id: "camp2".to_string(),
                next_seed_index: 5,
                total_seeds: 50,
            },
        ];

        let keep = policy.retain_checkpoints(&checkpoints);
        assert_eq!(keep, vec![false, true, true]); // keep the highest for camp1 (index 1), and for camp2 (index 2)
    }
}
