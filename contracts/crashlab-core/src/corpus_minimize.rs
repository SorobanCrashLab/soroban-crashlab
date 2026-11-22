//! Corpus minimization with coverage-equivalence and provenance retention (#1853).
//!
//! Seeds are grouped by a **behavior key**. Within each group the smallest
//! payload is kept as the representative, and every seed carrying a provenance
//! tag that no other live seed shares is kept as well (incident-linked seeds are
//! never dropped as redundant).
//!
//! # Behavior key and fallback
//!
//! The preferred key is the observed `(category, signature_hash)` pair stored on
//! [`CorpusRecord::observed_signature`]. The corpus format does not persist
//! observed signatures today, so when that field is `None` the key falls back to
//! the **outcome class** from [`classify_failure`] (`FailureClass`) with no
//! signature hash. This fallback is coarse by design: a per-seed coverage set
//! does not exist yet. The payload-derived hash from `classify()` is deliberately
//! *not* used as a fallback, because it hashes the payload bytes and would make
//! almost every distinct payload its own group.
//!
//! # Tombstones
//!
//! No tombstone or retention mechanism existed for corpus seeds, so this module
//! adds [`CorpusRecord::tombstoned`]. [`apply_minimization`] only sets that flag;
//! records are never hard-deleted.
//!
//! Planning is a pure function over `&[CorpusRecord]`, so a dry run cannot
//! mutate the store.

use crate::{classify_failure, CaseSeed, CrashSignature};
use std::collections::{BTreeMap, BTreeSet};

/// Seed identifier used by the plan. Must be unique among live records.
pub type SeedId = u64;

/// A corpus seed plus the metadata minimization needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorpusRecord {
    pub seed: CaseSeed,
    /// Free-form provenance tag, e.g. an incident id or import source.
    pub provenance: Option<String>,
    /// Observed failure signature, when the run recorded one for this seed.
    pub observed_signature: Option<CrashSignature>,
    /// Soft-delete marker. Set by [`apply_minimization`]; never hard-deleted.
    pub tombstoned: bool,
}

impl CorpusRecord {
    /// Builds a live record with no provenance or observed signature.
    pub fn new(seed: CaseSeed) -> Self {
        Self {
            seed,
            provenance: None,
            observed_signature: None,
            tombstoned: false,
        }
    }
}

/// Behavior key: seeds with equal keys are treated as coverage-equivalent.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BehaviorKey {
    /// Failure category label, or the [`FailureClass`] label on fallback.
    pub outcome_class: String,
    /// Observed signature hash; `None` when the key fell back to the class.
    pub signature_hash: Option<u64>,
}

/// Computes the behavior key for a record (see module docs for the fallback).
pub fn behavior_key(record: &CorpusRecord) -> BehaviorKey {
    match &record.observed_signature {
        Some(sig) => BehaviorKey {
            outcome_class: sig.category.clone(),
            signature_hash: Some(sig.signature_hash),
        },
        None => BehaviorKey {
            outcome_class: classify_failure(&record.seed).as_str().to_string(),
            signature_hash: None,
        },
    }
}

/// A set of seeds sharing one behavior key. Members are sorted by id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BehaviorGroup {
    pub key: BehaviorKey,
    pub members: Vec<SeedId>,
}

/// Result of planning a minimization. Pure data; producing it writes nothing.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MinimizationPlan {
    /// Groups in key order.
    pub groups: Vec<BehaviorGroup>,
    /// Seeds to retain, sorted by id.
    pub keep: Vec<SeedId>,
    /// Seeds to tombstone, sorted by id.
    pub remove: Vec<SeedId>,
    /// Total payload bytes of the seeds in `remove`.
    pub bytes_saved: u64,
}

/// Errors from planning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MinimizeError {
    /// Two live records share an id, so the plan cannot address them.
    DuplicateSeedId(SeedId),
}

impl std::fmt::Display for MinimizeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MinimizeError::DuplicateSeedId(id) => {
                write!(f, "duplicate live seed id {id}; cannot plan minimization")
            }
        }
    }
}

impl std::error::Error for MinimizeError {}

/// Plans a minimization without mutating `store`.
///
/// Tombstoned records are ignored. Within each behavior group the representative
/// is the smallest payload (ties broken by id). Every other member is removed
/// unless its non-empty provenance tag is carried by no other live record.
pub fn plan_minimization(store: &[CorpusRecord]) -> Result<MinimizationPlan, MinimizeError> {
    let mut live: Vec<&CorpusRecord> = store.iter().filter(|r| !r.tombstoned).collect();
    live.sort_by(|a, b| a.seed.id.cmp(&b.seed.id));

    for pair in live.windows(2) {
        if pair[0].seed.id == pair[1].seed.id {
            return Err(MinimizeError::DuplicateSeedId(pair[0].seed.id));
        }
    }

    let mut provenance_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for record in &live {
        if let Some(tag) = record.provenance.as_deref() {
            *provenance_counts.entry(tag).or_insert(0) += 1;
        }
    }
    let has_unique_provenance = |record: &CorpusRecord| {
        record
            .provenance
            .as_deref()
            .map(|tag| provenance_counts.get(tag).copied().unwrap_or(0) == 1)
            .unwrap_or(false)
    };

    let mut buckets: BTreeMap<BehaviorKey, Vec<&CorpusRecord>> = BTreeMap::new();
    for record in &live {
        buckets.entry(behavior_key(record)).or_default().push(*record);
    }

    let mut plan = MinimizationPlan::default();
    for (key, mut members) in buckets {
        // Smallest payload first, ties by id; the first member is the representative.
        members.sort_by(|a, b| {
            a.seed
                .payload
                .len()
                .cmp(&b.seed.payload.len())
                .then_with(|| a.seed.id.cmp(&b.seed.id))
        });

        let mut member_ids: Vec<SeedId> = members.iter().map(|r| r.seed.id).collect();
        member_ids.sort_unstable();

        for (index, record) in members.iter().enumerate() {
            let retained = index == 0 || has_unique_provenance(*record);
            if retained {
                plan.keep.push(record.seed.id);
            } else {
                plan.remove.push(record.seed.id);
                plan.bytes_saved += record.seed.payload.len() as u64;
            }
        }

        plan.groups.push(BehaviorGroup {
            key,
            members: member_ids,
        });
    }

    plan.keep.sort_unstable();
    plan.remove.sort_unstable();
    Ok(plan)
}

/// Summary of an apply step.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ApplyReport {
    /// Records newly marked tombstoned by this call.
    pub tombstoned: usize,
    /// Payload bytes of the newly tombstoned records.
    pub bytes_tombstoned: u64,
}

/// Marks the plan's `remove` ids as tombstoned. Nothing is hard-deleted.
///
/// Already-tombstoned records are left alone, so applying the same plan twice is
/// a no-op the second time.
pub fn apply_minimization(plan: &MinimizationPlan, store: &mut [CorpusRecord]) -> ApplyReport {
    let remove: BTreeSet<SeedId> = plan.remove.iter().copied().collect();
    let mut report = ApplyReport::default();
    for record in store.iter_mut() {
        if !record.tombstoned && remove.contains(&record.seed.id) {
            record.tombstoned = true;
            report.tombstoned += 1;
            report.bytes_tombstoned += record.seed.payload.len() as u64;
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(hash: u64) -> CrashSignature {
        CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0,
            signature_hash: hash,
        }
    }

    fn rec(id: u64, payload: Vec<u8>, hash: u64) -> CorpusRecord {
        CorpusRecord {
            seed: CaseSeed { id, payload },
            provenance: None,
            observed_signature: Some(sig(hash)),
            tombstoned: false,
        }
    }

    #[test]
    fn redundant_seeds_with_same_behavior_are_removed() {
        let store = vec![
            rec(1, vec![1, 2, 3, 4, 5], 42),
            rec(2, vec![1], 42),
            rec(3, vec![1, 2, 3], 42),
        ];
        let plan = plan_minimization(&store).unwrap();
        assert_eq!(plan.keep, vec![2]);
        assert_eq!(plan.remove, vec![1, 3]);
        assert_eq!(plan.bytes_saved, 8);
        assert_eq!(plan.groups.len(), 1);
        assert_eq!(plan.groups[0].members, vec![1, 2, 3]);
    }

    #[test]
    fn distinct_behaviors_are_both_kept() {
        let store = vec![rec(1, vec![1, 2], 1), rec(2, vec![3, 4, 5], 2)];
        let plan = plan_minimization(&store).unwrap();
        assert_eq!(plan.keep, vec![1, 2]);
        assert!(plan.remove.is_empty());
        assert_eq!(plan.bytes_saved, 0);
    }

    #[test]
    fn unique_provenance_seed_is_retained_even_if_redundant() {
        let mut incident = rec(5, vec![9, 9, 9, 9], 42);
        incident.provenance = Some("incident-77".to_string());
        let store = vec![rec(1, vec![1], 42), incident];
        let plan = plan_minimization(&store).unwrap();
        assert_eq!(plan.keep, vec![1, 5]);
        assert!(plan.remove.is_empty());
    }

    #[test]
    fn shared_provenance_does_not_protect_seeds() {
        let mut a = rec(1, vec![1, 1], 42);
        let mut b = rec(2, vec![1, 1, 1], 42);
        a.provenance = Some("import-x".to_string());
        b.provenance = Some("import-x".to_string());
        let plan = plan_minimization(&[a, b]).unwrap();
        assert_eq!(plan.keep, vec![1]);
        assert_eq!(plan.remove, vec![2]);
    }

    #[test]
    fn fallback_key_uses_outcome_class_when_no_signature() {
        // Both payloads start with 0x05 (Xdr class) and have no observed signature.
        let a = CorpusRecord::new(CaseSeed { id: 1, payload: vec![0x05, 0x00, 0x00] });
        let b = CorpusRecord::new(CaseSeed { id: 2, payload: vec![0x05] });
        assert_eq!(behavior_key(&a), behavior_key(&b));
        assert_eq!(behavior_key(&a).signature_hash, None);
        let plan = plan_minimization(&[a, b]).unwrap();
        assert_eq!(plan.keep, vec![2]);
        assert_eq!(plan.remove, vec![1]);
    }

    #[test]
    fn duplicate_live_ids_are_rejected() {
        let store = vec![rec(1, vec![1], 1), rec(1, vec![2], 2)];
        assert_eq!(
            plan_minimization(&store).unwrap_err(),
            MinimizeError::DuplicateSeedId(1)
        );
    }

    #[test]
    fn dry_run_plan_leaves_store_unchanged() {
        let store = vec![rec(1, vec![1, 2, 3], 42), rec(2, vec![1], 42)];
        let before = store.clone();
        let plan = plan_minimization(&store).unwrap();
        assert_eq!(plan.remove, vec![1]);
        assert_eq!(store, before);
    }

    #[test]
    fn apply_tombstones_without_removing_records() {
        let mut store = vec![rec(1, vec![1, 2, 3], 42), rec(2, vec![1], 42)];
        let plan = plan_minimization(&store).unwrap();
        let report = apply_minimization(&plan, &mut store);
        assert_eq!(report.tombstoned, 1);
        assert_eq!(report.bytes_tombstoned, 3);
        assert_eq!(store.len(), 2, "tombstone must not hard-delete");
        assert!(store[0].tombstoned);
        assert_eq!(store[0].seed.payload, vec![1, 2, 3]);
        assert!(!store[1].tombstoned);
    }

    #[test]
    fn apply_is_idempotent_and_replanning_is_stable() {
        let mut store = vec![rec(1, vec![1, 2, 3], 42), rec(2, vec![1], 42)];
        let plan = plan_minimization(&store).unwrap();
        apply_minimization(&plan, &mut store);
        let again = apply_minimization(&plan, &mut store);
        assert_eq!(again, ApplyReport::default());
        let replan = plan_minimization(&store).unwrap();
        assert!(replan.remove.is_empty());
        assert_eq!(replan.keep, vec![2]);
    }

}
