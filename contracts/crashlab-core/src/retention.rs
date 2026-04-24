//! Configurable retention policies for run artifacts.
//!
//! Apply retention windows to prune old non-critical data while preserving
//! the latest failures and essential checkpoints.

use crate::{CaseBundleDocument, RunCheckpoint};
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;

/// Artifact wrapper with the timestamp needed for time-based pruning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionRecord<T> {
    pub artifact: T,
    pub created_at: DateTime<Utc>,
}

impl<T> RetentionRecord<T> {
    pub fn new(artifact: T, created_at: DateTime<Utc>) -> Self {
        Self {
            artifact,
            created_at,
        }
    }
}

/// Configuration for artifact retention policies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionPolicy {
    /// Maximum number of failure bundles to retain (keep the most recent by seed ID).
    pub max_failure_bundles: usize,
    /// Maximum number of checkpoints to retain per campaign (keep the most advanced).
    pub max_checkpoints_per_campaign: usize,
    /// Maximum age for failure bundles before they become prune candidates.
    pub failure_retention_window: Option<Duration>,
    /// Maximum age for checkpoints before they become prune candidates.
    pub checkpoint_retention_window: Option<Duration>,
    /// Number of newest failures to pin even when outside the retention window.
    pub keep_latest_failures: usize,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            max_failure_bundles: 100,
            max_checkpoints_per_campaign: 5,
            failure_retention_window: Some(Duration::days(30)),
            checkpoint_retention_window: Some(Duration::days(14)),
            keep_latest_failures: 10,
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
            cks.sort_by_key(|&(_, idx)| std::cmp::Reverse(idx));
            for &(i, _) in cks.iter().take(self.max_checkpoints_per_campaign) {
                keep[i] = true;
            }
        }
        keep
    }

    /// Applies time-aware retention to failure bundles.
    ///
    /// The newest `keep_latest_failures` bundles are always retained first so at
    /// least the latest failures survive even when old. Remaining bundles are
    /// kept when they are still within `failure_retention_window`, and the final
    /// result is capped at `max_failure_bundles`.
    pub fn retain_failure_bundle_records(
        &self,
        bundles: &[RetentionRecord<CaseBundleDocument>],
        now: DateTime<Utc>,
    ) -> Vec<bool> {
        if self.max_failure_bundles == 0 || bundles.is_empty() {
            return vec![false; bundles.len()];
        }

        let mut ranked: Vec<usize> = (0..bundles.len()).collect();
        ranked.sort_by(|&a, &b| {
            bundles[b]
                .created_at
                .cmp(&bundles[a].created_at)
                .then_with(|| {
                    bundles[b]
                        .artifact
                        .seed
                        .id
                        .cmp(&bundles[a].artifact.seed.id)
                })
        });

        let mut keep = vec![false; bundles.len()];
        let pinned = self
            .keep_latest_failures
            .min(self.max_failure_bundles)
            .min(ranked.len());

        for &i in ranked.iter().take(pinned) {
            keep[i] = true;
        }

        for &i in ranked.iter().skip(pinned) {
            if within_window(bundles[i].created_at, now, self.failure_retention_window) {
                keep[i] = true;
            }
        }

        trim_to_limit(&ranked, &mut keep, self.max_failure_bundles, pinned);
        keep
    }

    /// Applies time-aware retention to checkpoints.
    ///
    /// Each campaign keeps its most advanced checkpoints up to
    /// `max_checkpoints_per_campaign`, while recently-written checkpoints are
    /// also retained when still inside `checkpoint_retention_window`.
    pub fn retain_checkpoint_records(
        &self,
        checkpoints: &[RetentionRecord<RunCheckpoint>],
        now: DateTime<Utc>,
    ) -> Vec<bool> {
        let mut keep = vec![false; checkpoints.len()];
        let mut campaign_checkpoints: HashMap<&str, Vec<usize>> = HashMap::new();

        for (i, checkpoint) in checkpoints.iter().enumerate() {
            campaign_checkpoints
                .entry(checkpoint.artifact.campaign_id.as_str())
                .or_default()
                .push(i);
        }

        for (_campaign, mut indices) in campaign_checkpoints {
            indices.sort_by(|&a, &b| {
                checkpoints[b]
                    .artifact
                    .next_seed_index
                    .cmp(&checkpoints[a].artifact.next_seed_index)
                    .then_with(|| checkpoints[b].created_at.cmp(&checkpoints[a].created_at))
            });

            for &i in indices.iter().take(self.max_checkpoints_per_campaign) {
                keep[i] = true;
            }

            for &i in &indices {
                if within_window(
                    checkpoints[i].created_at,
                    now,
                    self.checkpoint_retention_window,
                ) {
                    keep[i] = true;
                }
            }
        }

        keep
    }
}

fn within_window(created_at: DateTime<Utc>, now: DateTime<Utc>, window: Option<Duration>) -> bool {
    match window {
        Some(window) => now.signed_duration_since(created_at) <= window,
        None => true,
    }
}

fn trim_to_limit(ranked: &[usize], keep: &mut [bool], limit: usize, pinned: usize) {
    let mut kept = keep.iter().filter(|&&value| value).count();
    if kept <= limit {
        return;
    }

    for &i in ranked.iter().rev() {
        if kept <= limit {
            break;
        }
        let is_pinned = ranked.iter().take(pinned).any(|&p| p == i);
        if keep[i] && !is_pinned {
            keep[i] = false;
            kept -= 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseSeed, CrashSignature, FailureClass, RunCheckpoint};

    fn bundle(id: u64, category: FailureClass) -> CaseBundleDocument {
        CaseBundleDocument {
            schema: 1,
            seed: CaseSeed {
                id,
                payload: vec![id as u8],
            },
            signature: CrashSignature {
                category: category.to_string(),
                digest: id,
                signature_hash: id,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        }
    }

    fn checkpoint(campaign_id: &str, next_seed_index: usize) -> RunCheckpoint {
        RunCheckpoint {
            schema: 1,
            campaign_id: campaign_id.to_string(),
            next_seed_index,
            total_seeds: 100,
        }
    }

    #[test]
    fn retain_failure_bundles_keeps_highest_seed_ids() {
        let policy = RetentionPolicy {
            max_failure_bundles: 2,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: None,
            checkpoint_retention_window: None,
            keep_latest_failures: 0,
        };

        let bundles = vec![
            bundle(1, FailureClass::Auth),
            bundle(3, FailureClass::Budget),
            bundle(2, FailureClass::State),
        ];

        let keep = policy.retain_failure_bundles(&bundles);
        assert_eq!(keep, vec![false, true, true]);
    }

    #[test]
    fn retain_checkpoints_keeps_most_advanced_per_campaign() {
        let policy = RetentionPolicy {
            max_failure_bundles: 1,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: None,
            checkpoint_retention_window: None,
            keep_latest_failures: 0,
        };

        let checkpoints = vec![
            checkpoint("camp1", 10),
            checkpoint("camp1", 20),
            checkpoint("camp2", 5),
        ];

        let keep = policy.retain_checkpoints(&checkpoints);
        assert_eq!(keep, vec![false, true, true]);
    }

    #[test]
    fn retain_failure_bundle_records_pins_latest_failures_outside_window() {
        let now = Utc::now();
        let policy = RetentionPolicy {
            max_failure_bundles: 2,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: Some(Duration::days(7)),
            checkpoint_retention_window: Some(Duration::days(7)),
            keep_latest_failures: 2,
        };

        let bundles = vec![
            RetentionRecord::new(bundle(1, FailureClass::Auth), now - Duration::days(40)),
            RetentionRecord::new(bundle(2, FailureClass::Budget), now - Duration::days(20)),
            RetentionRecord::new(bundle(3, FailureClass::State), now - Duration::days(1)),
        ];

        let keep = policy.retain_failure_bundle_records(&bundles, now);
        assert_eq!(keep, vec![false, true, true]);
    }

    #[test]
    fn retain_failure_bundle_records_trims_old_noncritical_data_to_limit() {
        let now = Utc::now();
        let policy = RetentionPolicy {
            max_failure_bundles: 2,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: Some(Duration::days(90)),
            checkpoint_retention_window: Some(Duration::days(7)),
            keep_latest_failures: 1,
        };

        let bundles = vec![
            RetentionRecord::new(bundle(1, FailureClass::Auth), now - Duration::days(3)),
            RetentionRecord::new(bundle(2, FailureClass::Budget), now - Duration::days(2)),
            RetentionRecord::new(bundle(3, FailureClass::State), now - Duration::days(1)),
        ];

        let keep = policy.retain_failure_bundle_records(&bundles, now);
        assert_eq!(keep, vec![false, true, true]);
    }

    #[test]
    fn retain_checkpoint_records_keeps_recent_and_most_advanced() {
        let now = Utc::now();
        let policy = RetentionPolicy {
            max_failure_bundles: 10,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: Some(Duration::days(30)),
            checkpoint_retention_window: Some(Duration::days(2)),
            keep_latest_failures: 1,
        };

        let checkpoints = vec![
            RetentionRecord::new(checkpoint("camp1", 10), now - Duration::days(10)),
            RetentionRecord::new(checkpoint("camp1", 12), now - Duration::days(1)),
            RetentionRecord::new(checkpoint("camp1", 8), now - Duration::hours(12)),
            RetentionRecord::new(checkpoint("camp2", 5), now - Duration::days(5)),
        ];

        let keep = policy.retain_checkpoint_records(&checkpoints, now);
        assert_eq!(keep, vec![false, true, true, true]);
    }

    #[test]
    fn default_policy_has_explicit_windows() {
        let policy = RetentionPolicy::default();
        assert_eq!(policy.failure_retention_window, Some(Duration::days(30)));
        assert_eq!(policy.checkpoint_retention_window, Some(Duration::days(14)));
        assert_eq!(policy.keep_latest_failures, 10);
    }
}
