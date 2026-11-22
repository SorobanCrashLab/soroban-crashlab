//! Configurable retention policies for run artifacts.
//!
//! Apply retention windows to prune old non-critical data while preserving
//! the latest failures and essential checkpoints.
//!
//! Supports per-artifact-class policies, pinned-never-delete protection, and
//! two-phase (mark-expired → grace → delete) leased sweeps with dry-run plans.

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

/// Artifact class used to select a per-class retention policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ArtifactClass {
    /// Crash bundles (highest forensic value).
    Bundle,
    /// Execution traces.
    Trace,
    /// Raw seed inputs.
    RawSeed,
    /// Generic raw artifacts (legacy backends).
    Raw,
    /// Aggregated statistics.
    AggregatedStats,
    /// Audit logs.
    Audit,
}

impl ArtifactClass {
    /// Stable string identifier used in config and reports.
    pub fn as_str(&self) -> &'static str {
        match self {
            ArtifactClass::Bundle => "bundle",
            ArtifactClass::Trace => "trace",
            ArtifactClass::RawSeed => "raw_seed",
            ArtifactClass::Raw => "raw",
            ArtifactClass::AggregatedStats => "aggregated_stats",
            ArtifactClass::Audit => "audit",
        }
    }

    /// Classifies an artifact id into a class by prefix convention.
    pub fn classify(id: &str) -> ArtifactClass {
        let lower = id.to_lowercase();
        if lower.starts_with("bundle") || lower.starts_with("crash") {
            ArtifactClass::Bundle
        } else if lower.starts_with("trace") {
            ArtifactClass::Trace
        } else if lower.starts_with("seed") {
            ArtifactClass::RawSeed
        } else if lower.starts_with("stat") {
            ArtifactClass::AggregatedStats
        } else if lower.starts_with("audit") || lower.starts_with("log") {
            ArtifactClass::Audit
        } else {
            ArtifactClass::Raw
        }
    }
}

/// Per-artifact-class retention policy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassPolicy {
    /// Maximum age before an artifact becomes an expiry candidate.
    pub ttl: Option<Duration>,
    /// Always keep the newest N artifacts of this class regardless of age.
    pub min_count: usize,
}

impl Default for ClassPolicy {
    fn default() -> Self {
        Self {
            ttl: Some(Duration::days(30)),
            min_count: 1,
        }
    }
}

/// Set of per-class policies with documented defaults.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassPolicies {
    pub bundle: ClassPolicy,
    pub trace: ClassPolicy,
    pub raw_seed: ClassPolicy,
    pub raw: ClassPolicy,
    pub aggregated_stats: ClassPolicy,
    pub audit: ClassPolicy,
}

impl Default for ClassPolicies {
    fn default() -> Self {
        Self {
            bundle: ClassPolicy {
                ttl: Some(Duration::days(30)),
                min_count: 10,
            },
            trace: ClassPolicy {
                ttl: Some(Duration::days(14)),
                min_count: 5,
            },
            raw_seed: ClassPolicy {
                ttl: Some(Duration::days(7)),
                min_count: 3,
            },
            raw: ClassPolicy {
                ttl: Some(Duration::days(7)),
                min_count: 1,
            },
            aggregated_stats: ClassPolicy {
                ttl: Some(Duration::days(90)),
                min_count: 1,
            },
            audit: ClassPolicy {
                ttl: Some(Duration::days(365)),
                min_count: 1,
            },
        }
    }
}

impl ClassPolicies {
    /// Returns the policy for a given artifact class.
    pub fn for_class(&self, class: ArtifactClass) -> &ClassPolicy {
        match class {
            ArtifactClass::Bundle => &self.bundle,
            ArtifactClass::Trace => &self.trace,
            ArtifactClass::RawSeed => &self.raw_seed,
            ArtifactClass::Raw => &self.raw,
            ArtifactClass::AggregatedStats => &self.aggregated_stats,
            ArtifactClass::Audit => &self.audit,
        }
    }
}

/// A pinned artifact that must never be deleted (open issue refs, baselines).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pin {
    /// Artifact class the pin applies to.
    pub class: ArtifactClass,
    /// Stable identifier of the pinned artifact.
    pub id: String,
    /// Human-readable reason (e.g. "open issue #123", "regression baseline").
    pub reason: String,
}

/// A single artifact considered by the sweep planner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SweepCandidate {
    pub class: ArtifactClass,
    pub id: String,
    pub created_at: DateTime<Utc>,
}

/// Action the planner decided for a candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SweepAction {
    /// Keep the artifact.
    Keep,
    /// Mark as expired; deletion happens after the grace window.
    MarkExpired,
}

/// A planned action for a single candidate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SweepPlanEntry {
    pub class: ArtifactClass,
    pub id: String,
    pub action: SweepAction,
    pub reason: String,
}

/// Full sweep plan produced by the planner (used by `--dry-run`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SweepPlan {
    pub entries: Vec<SweepPlanEntry>,
}

impl SweepPlan {
    /// Number of artifacts that would be marked expired.
    pub fn expired_count(&self) -> usize {
        self.entries
            .iter()
            .filter(|e| e.action == SweepAction::MarkExpired)
            .count()
    }

    /// Renders a human-readable plan for `--dry-run` output.
    pub fn render(&self) -> String {
        let mut out = String::new();
        for entry in &self.entries {
            let action = match entry.action {
                SweepAction::Keep => "keep",
                SweepAction::MarkExpired => "mark-expired",
            };
            out.push_str(&format!(
                "{} {} {} ({})\n",
                action,
                entry.class.as_str(),
                entry.id,
                entry.reason
            ));
        }
        out
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
    /// Maximum age for run heartbeats before considering a run directory abandoned (default: 60s).
    pub heartbeat_ttl: Option<Duration>,
    /// Grace period between marking a candidate and actual deletion in two-phase sweep.
    pub sweep_grace_period: Duration,
    /// Per-artifact-class policies.
    pub class_policies: ClassPolicies,
    /// Pinned artifacts that must never be deleted.
    pub pins: Vec<Pin>,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            max_failure_bundles: 100,
            max_checkpoints_per_campaign: 5,
            failure_retention_window: Some(Duration::days(30)),
            checkpoint_retention_window: Some(Duration::days(14)),
            keep_latest_failures: 10,
            heartbeat_ttl: Some(Duration::seconds(60)),
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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

    /// Returns true if the given artifact is pinned and must never be deleted.
    pub fn is_pinned(&self, class: ArtifactClass, id: &str) -> Option<&Pin> {
        self.pins
            .iter()
            .find(|pin| pin.class == class && pin.id == id)
    }

    /// Builds a sweep plan for the given candidates without performing any writes.
    ///
    /// Applies per-class TTL and min-count floors, then excludes pinned
    /// artifacts. This is the single source of truth used by both `--dry-run`
    /// and the real sweep so the plan and execution cannot diverge.
    pub fn plan_sweep(&self, candidates: &[SweepCandidate], now: DateTime<Utc>) -> SweepPlan {
        let mut entries = Vec::with_capacity(candidates.len());

        // Group indices by class so min-count floors are computed per class.
        let mut by_class: HashMap<ArtifactClass, Vec<usize>> = HashMap::new();
        for (i, candidate) in candidates.iter().enumerate() {
            by_class.entry(candidate.class).or_default().push(i);
        }

        let mut decisions: Vec<Option<SweepPlanEntry>> = vec![None; candidates.len()];

        for (class, mut indices) in by_class {
            let policy = self.class_policies.for_class(class);
            indices.sort_by(|&a, &b| {
                candidates[b]
                    .created_at
                    .cmp(&candidates[a].created_at)
                    .then_with(|| candidates[b].id.cmp(&candidates[a].id))
            });

            for (rank, &i) in indices.iter().enumerate() {
                let candidate = &candidates[i];
                let entry = if let Some(pin) = self.is_pinned(class, &candidate.id) {
                    SweepPlanEntry {
                        class,
                        id: candidate.id.clone(),
                        action: SweepAction::Keep,
                        reason: format!("pinned: {}", pin.reason),
                    }
                } else if rank < policy.min_count {
                    SweepPlanEntry {
                        class,
                        id: candidate.id.clone(),
                        action: SweepAction::Keep,
                        reason: format!("min-count floor ({})", policy.min_count),
                    }
                } else if within_window(candidate.created_at, now, policy.ttl) {
                    SweepPlanEntry {
                        class,
                        id: candidate.id.clone(),
                        action: SweepAction::Keep,
                        reason: "within ttl".to_string(),
                    }
                } else {
                    SweepPlanEntry {
                        class,
                        id: candidate.id.clone(),
                        action: SweepAction::MarkExpired,
                        reason: "past ttl".to_string(),
                    }
                };
                decisions[i] = Some(entry);
            }
        }

        for decision in decisions.into_iter().flatten() {
            entries.push(decision);
        }

        SweepPlan { entries }
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
            provenance: None,
            original_seed: None,
            shrink_lineage: None,
            engine_version: String::new(),
        }
    }

    fn checkpoint(campaign_id: &str, next_seed_index: usize) -> RunCheckpoint {
        let mut checkpoint = RunCheckpoint::new_run(campaign_id, &[]);
        checkpoint.next_seed_index = next_seed_index;
        checkpoint.total_seeds = 100;
        checkpoint
    }

    #[test]
    fn retain_failure_bundles_keeps_highest_seed_ids() {
        let policy = RetentionPolicy {
            max_failure_bundles: 2,
            max_checkpoints_per_campaign: 1,
            failure_retention_window: None,
            checkpoint_retention_window: None,
            keep_latest_failures: 0,
            heartbeat_ttl: None,
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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
            heartbeat_ttl: None,
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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
            heartbeat_ttl: None,
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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
            heartbeat_ttl: None,
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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
            heartbeat_ttl: None,
            sweep_grace_period: Duration::zero(),
            class_policies: ClassPolicies::default(),
            pins: Vec::new(),
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
        assert_eq!(policy.heartbeat_ttl, Some(Duration::seconds(60)));
        assert_eq!(policy.sweep_grace_period, Duration::zero());
    }

    fn candidate(class: ArtifactClass, id: &str, created_at: DateTime<Utc>) -> SweepCandidate {
        SweepCandidate {
            class,
            id: id.to_string(),
            created_at,
        }
    }

    #[test]
    fn plan_sweep_applies_per_class_ttl() {
        let now = Utc::now();
        let mut policy = RetentionPolicy::default();
        policy.class_policies.bundle.ttl = Some(Duration::days(30));
        policy.class_policies.bundle.min_count = 0;
        policy.class_policies.trace.ttl = Some(Duration::days(7));
        policy.class_policies.trace.min_count = 0;

        let candidates = vec![
            candidate(ArtifactClass::Bundle, "b-old", now - Duration::days(40)),
            candidate(ArtifactClass::Bundle, "b-new", now - Duration::days(1)),
            candidate(ArtifactClass::Trace, "t-old", now - Duration::days(10)),
            candidate(ArtifactClass::Trace, "t-new", now - Duration::days(1)),
        ];

        let plan = policy.plan_sweep(&candidates, now);
        let expired: Vec<&str> = plan
            .entries
            .iter()
            .filter(|e| e.action == SweepAction::MarkExpired)
            .map(|e| e.id.as_str())
            .collect();
        assert_eq!(expired, vec!["b-old", "t-old"]);
    }

    #[test]
    fn plan_sweep_respects_min_count_floor() {
        let now = Utc::now();
        let mut policy = RetentionPolicy::default();
        policy.class_policies.raw_seed.ttl = Some(Duration::days(1));
        policy.class_policies.raw_seed.min_count = 2;

        let candidates = vec![
            candidate(ArtifactClass::RawSeed, "s1", now - Duration::days(10)),
            candidate(ArtifactClass::RawSeed, "s2", now - Duration::days(9)),
            candidate(ArtifactClass::RawSeed, "s3", now - Duration::days(8)),
        ];

        let plan = policy.plan_sweep(&candidates, now);
        let kept: Vec<&str> = plan
            .entries
            .iter()
            .filter(|e| e.action == SweepAction::Keep)
            .map(|e| e.id.as_str())
            .collect();
        assert_eq!(kept, vec!["s3", "s2"]);
        assert_eq!(plan.expired_count(), 1);
    }

    #[test]
    fn plan_sweep_protects_pinned_artifacts() {
        let now = Utc::now();
        let mut policy = RetentionPolicy::default();
        policy.class_policies.bundle.ttl = Some(Duration::days(1));
        policy.class_policies.bundle.min_count = 0;
        policy.pins.push(Pin {
            class: ArtifactClass::Bundle,
            id: "b-pinned".to_string(),
            reason: "open issue #42".to_string(),
        });

        let candidates = vec![
            candidate(ArtifactClass::Bundle, "b-pinned", now - Duration::days(100)),
            candidate(ArtifactClass::Bundle, "b-other", now - Duration::days(100)),
        ];

        let plan = policy.plan_sweep(&candidates, now);
        let pinned = plan
            .entries
            .iter()
            .find(|e| e.id == "b-pinned")
            .expect("pinned entry present");
        assert_eq!(pinned.action, SweepAction::Keep);
        assert!(pinned.reason.contains("pinned"));
        assert_eq!(plan.expired_count(), 1);
    }

    #[test]
    fn dry_run_plan_renders_without_mutation() {
        let now = Utc::now();
        let mut policy = RetentionPolicy::default();
        policy.class_policies.audit.ttl = Some(Duration::days(1));
        policy.class_policies.audit.min_count = 0;

        let candidates = vec![candidate(
            ArtifactClass::Audit,
            "a-old",
            now - Duration::days(10),
        )];
        let snapshot = candidates.clone();

        let plan = policy.plan_sweep(&candidates, now);
        assert_eq!(candidates, snapshot, "planning must not mutate input");
        let rendered = plan.render();
        assert!(rendered.contains("mark-expired audit a-old"));
    }
}
