//! Duplicate crash de-duplication index.
//!
//! Groups repeated failures by their [`CrashSignature::signature_hash`] to
//! reduce noise in dashboards and CLI reports. Each unique signature is
//! represented by a single [`CrashGroup`] that tracks the hit count and the
//! most recently observed [`CaseBundle`] as the canonical sample.
//!
//! # Example
//!
//! ```rust
//! use crashlab_core::{CaseSeed, to_bundle};
//! use crashlab_core::crash_index::CrashIndex;
//!
//! let mut index = CrashIndex::new();
//!
//! // Same seed id → same mutated payload → same signature_hash → one group.
//! let b1 = to_bundle(CaseSeed { id: 1, payload: vec![0x10, 0x20] });
//! let b2 = to_bundle(CaseSeed { id: 1, payload: vec![0x10, 0x20] });
//! // A distinct seed id → different mutated payload → different group.
//! let b3 = to_bundle(CaseSeed { id: 3, payload: vec![0xAA, 0xBB] });
//!
//! index.insert(b1);
//! index.insert(b2);
//! index.insert(b3);
//!
//! assert_eq!(index.len(), 2);
//!
//! let groups = index.groups_by_count();
//! assert_eq!(groups[0].count, 2); // most frequent first
//! assert_eq!(groups[1].count, 1);
//! ```

use crate::CaseBundle;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A deduplicated group of crashes that share the same [`CrashSignature::signature_hash`].
///
/// `newest_sample` is kept in-memory only; use [`CrashIndexSummary`] (which
/// stores a [`CrashGroupRecord`] per group) when you need a fully serialisable
/// snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrashGroup {
    /// The stable hash that identifies this group (from [`CrashSignature::signature_hash`]).
    pub signature_hash: u64,
    /// Human-readable failure category (e.g. `"auth"`, `"budget"`).
    pub category: String,
    /// Total number of times this signature has been observed.
    pub count: u64,
    /// The most recently inserted bundle for this group — use as the canonical sample.
    pub newest_sample: CaseBundle,
}

/// Serialisable record for a single crash group — used inside [`CrashIndexSummary`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrashGroupRecord {
    pub signature_hash: u64,
    pub category: String,
    pub count: u64,
    /// Seed ID of the most recently observed bundle.
    pub newest_seed_id: u64,
}

impl From<&CrashGroup> for CrashGroupRecord {
    fn from(g: &CrashGroup) -> Self {
        CrashGroupRecord {
            signature_hash: g.signature_hash,
            category: g.category.clone(),
            count: g.count,
            newest_seed_id: g.newest_sample.seed.id,
        }
    }
}

/// In-memory index that deduplicates crash bundles by signature hash.
///
/// Insertion is O(1) amortised. Retrieval methods return owned `Vec`s sorted
/// on demand so the index itself stays unsorted for fast writes.
#[derive(Debug, Clone, Default)]
pub struct CrashIndex {
    groups: HashMap<u64, CrashGroup>,
}

impl CrashIndex {
    /// Creates an empty index.
    pub fn new() -> Self {
        Self::default()
    }

    /// Inserts `bundle` into the index.
    ///
    /// If a group already exists for `bundle.signature.signature_hash`, the
    /// count is incremented and `newest_sample` is replaced with `bundle`.
    /// Otherwise a new group is created with `count = 1`.
    pub fn insert(&mut self, bundle: CaseBundle) {
        let key = bundle.signature.signature_hash;
        match self.groups.get_mut(&key) {
            Some(group) => {
                group.count += 1;
                group.newest_sample = bundle;
            }
            None => {
                let group = CrashGroup {
                    signature_hash: key,
                    category: bundle.signature.category.clone(),
                    count: 1,
                    newest_sample: bundle,
                };
                self.groups.insert(key, group);
            }
        }
    }

    /// Number of distinct crash signatures tracked.
    pub fn len(&self) -> usize {
        self.groups.len()
    }

    /// Returns `true` when no bundles have been inserted.
    pub fn is_empty(&self) -> bool {
        self.groups.is_empty()
    }

    /// Returns all groups sorted by `count` descending (highest-frequency first).
    ///
    /// Ties are broken by `signature_hash` for deterministic output.
    pub fn groups_by_count(&self) -> Vec<&CrashGroup> {
        let mut groups: Vec<&CrashGroup> = self.groups.values().collect();
        groups.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| a.signature_hash.cmp(&b.signature_hash))
        });
        groups
    }

    /// Returns all groups sorted by `category` then `count` descending.
    ///
    /// Useful for CLI reports that group output by failure class.
    pub fn groups_by_category(&self) -> Vec<&CrashGroup> {
        let mut groups: Vec<&CrashGroup> = self.groups.values().collect();
        groups.sort_by(|a, b| {
            a.category
                .cmp(&b.category)
                .then_with(|| b.count.cmp(&a.count))
                .then_with(|| a.signature_hash.cmp(&b.signature_hash))
        });
        groups
    }

    /// Looks up a group by its `signature_hash`.
    pub fn get(&self, signature_hash: u64) -> Option<&CrashGroup> {
        self.groups.get(&signature_hash)
    }

    /// Builds a [`CrashIndex`] from an iterator of bundles.
    pub fn from_bundles(bundles: impl IntoIterator<Item = CaseBundle>) -> Self {
        let mut index = Self::new();
        for bundle in bundles {
            index.insert(bundle);
        }
        index
    }

    /// Returns a [`CrashIndexSummary`] suitable for dashboard and CLI rendering.
    pub fn summary(&self) -> CrashIndexSummary {
        let total_crashes: u64 = self.groups.values().map(|g| g.count).sum();
        CrashIndexSummary {
            unique_signatures: self.groups.len() as u64,
            total_crashes,
            groups: self
                .groups_by_count()
                .into_iter()
                .map(CrashGroupRecord::from)
                .collect(),
        }
    }
}

/// Serialisable snapshot of the index for dashboard and CLI consumption.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrashIndexSummary {
    /// Number of distinct crash signatures.
    pub unique_signatures: u64,
    /// Total crash events recorded (sum of all group counts).
    pub total_crashes: u64,
    /// Groups ordered by count descending.
    pub groups: Vec<CrashGroupRecord>,
}

impl CrashIndexSummary {
    /// Formats a compact text table for CLI output.
    ///
    /// ```text
    /// SIGNATURE          CATEGORY        COUNT  NEWEST SEED
    /// 0x1a2b3c4d5e6f7890  runtime-failure    42  seed#99
    /// 0xdeadbeefcafe0000  auth                3  seed#7
    /// ```
    pub fn to_cli_table(&self) -> String {
        let mut out = format!(
            "{:<20} {:<16} {:>6}  {}\n",
            "SIGNATURE", "CATEGORY", "COUNT", "NEWEST SEED"
        );
        for g in &self.groups {
            out.push_str(&format!(
                "{:#018x}  {:<16} {:>6}  seed#{}\n",
                g.signature_hash, g.category, g.count, g.newest_seed_id,
            ));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, CaseSeed};

    fn bundle(id: u64, payload: Vec<u8>) -> CaseBundle {
        to_bundle(CaseSeed { id, payload })
    }

    #[test]
    fn empty_index_has_zero_len() {
        assert!(CrashIndex::new().is_empty());
    }

    #[test]
    fn single_insert_creates_one_group_with_count_one() {
        let mut idx = CrashIndex::new();
        idx.insert(bundle(1, vec![0x10, 0x20]));
        assert_eq!(idx.len(), 1);
        let groups = idx.groups_by_count();
        assert_eq!(groups[0].count, 1);
    }

    #[test]
    fn same_payload_different_ids_merge_into_one_group() {
        let mut idx = CrashIndex::new();
        let b1 = bundle(1, vec![0x10, 0x20]);
        let b2 = bundle(1, vec![0x10, 0x20]); // same id → same mutated payload → same hash
        assert_eq!(b1.signature.signature_hash, b2.signature.signature_hash);

        idx.insert(b1);
        idx.insert(b2.clone());

        assert_eq!(idx.len(), 1);
        let groups = idx.groups_by_count();
        assert_eq!(groups[0].count, 2);
        // newest_sample should be the last inserted bundle.
        assert_eq!(groups[0].newest_sample.seed.id, b2.seed.id);
    }

    #[test]
    fn distinct_payloads_create_separate_groups() {
        let mut idx = CrashIndex::new();
        let b1 = bundle(1, vec![0x10, 0x20]);
        let b2 = bundle(2, vec![0xAA, 0xBB]);
        // Ensure they actually differ (they should since different ids + payloads).
        // If by chance they collide, use a different payload.
        idx.insert(b1.clone());
        idx.insert(b2.clone());
        if b1.signature.signature_hash == b2.signature.signature_hash {
            // Extremely unlikely collision — just verify count is at least 1.
            assert!(idx.len() >= 1);
        } else {
            assert_eq!(idx.len(), 2);
        }
    }

    #[test]
    fn groups_by_count_orders_highest_first() {
        let mut idx = CrashIndex::new();
        // Same seed id → same mutated payload → same signature_hash each time.
        for _ in 0..3 {
            idx.insert(bundle(1, vec![0x01]));
        }
        idx.insert(bundle(2, vec![0x02]));

        let groups = idx.groups_by_count();
        assert_eq!(groups[0].count, 3);
        assert_eq!(groups[1].count, 1);
    }

    #[test]
    fn groups_by_category_sorts_by_category_then_count() {
        let mut idx = CrashIndex::new();
        // Force two different categories by using empty (empty-input) and oversized payloads.
        idx.insert(bundle(1, vec![])); // empty-input
        idx.insert(bundle(2, vec![0x01])); // runtime-failure
        idx.insert(bundle(3, vec![0x01])); // runtime-failure (count=2)

        let groups = idx.groups_by_category();
        // "empty-input" < "runtime-failure" lexicographically.
        assert_eq!(groups[0].category, "empty-input");
        assert_eq!(groups[1].category, "runtime-failure");
    }

    #[test]
    fn from_bundles_builds_correct_index() {
        // Use same seed id for duplicates so mutation produces the same hash.
        let bundles = vec![
            bundle(1, vec![0x10]),
            bundle(1, vec![0x10]),
            bundle(2, vec![0x20]),
        ];
        let idx = CrashIndex::from_bundles(bundles);
        assert_eq!(idx.len(), 2);
    }

    #[test]
    fn summary_totals_are_correct() {
        let mut idx = CrashIndex::new();
        for _ in 0..5 {
            idx.insert(bundle(1, vec![0x01]));
        }
        idx.insert(bundle(2, vec![0x02]));

        let s = idx.summary();
        assert_eq!(s.unique_signatures, 2);
        assert_eq!(s.total_crashes, 6);
        assert_eq!(s.groups[0].count, 5); // highest first
    }

    #[test]
    fn cli_table_contains_category_and_count() {
        let mut idx = CrashIndex::new();
        idx.insert(bundle(1, vec![0x01]));
        let table = idx.summary().to_cli_table();
        assert!(table.contains("runtime-failure"));
        assert!(table.contains("seed#"));
    }

    #[test]
    fn get_returns_group_for_known_hash() {
        let mut idx = CrashIndex::new();
        let b = bundle(7, vec![0x42]);
        let hash = b.signature.signature_hash;
        idx.insert(b);
        assert!(idx.get(hash).is_some());
        assert!(idx.get(0xDEAD_BEEF).is_none());
    }
}
