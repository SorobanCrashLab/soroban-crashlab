//! Deterministic, resize-stable assignment of global seed indices to workers.
//!
//! The legacy scheme assigned seed `i` to worker `i % num_workers`. Any change
//! to `num_workers` (resuming a campaign on a different pool size, horizontal
//! scaling, or replacing a dead worker) re-derived every assignment, so seeds
//! already covered could be handed to a different worker and re-executed while
//! others were never executed at all.
//!
//! This module replaces modulo assignment with a *fixed ring*:
//!
//! * [`RING_SIZE`] ring slots (`0..RING_SIZE`) exist and never depend on the
//!   worker count.
//! * A seed index is placed on the ring by [`ring_slot`], a stable pure hash of
//!   the index, so a seed's ring slot is immutable for the lifetime of a
//!   campaign and identical on every host.
//! * Worker `w` of `num_workers` owns the contiguous ring range returned by
//!   [`WorkerPartition::ring_range`]. For any worker count those ranges are
//!   pairwise disjoint and their union is the whole ring, so a resize only
//!   moves the *boundaries*; it never moves a seed between ring slots.
//! * Progress is therefore recorded as *ring coverage* ([`RingCoverage`])
//!   instead of a worker-local modulo cursor. A resumed/resized run intersects
//!   its new ranges with the recorded coverage and only executes uncovered
//!   slots, which prevents both duplicate execution and coverage holes.
//!
//! Because each worker still walks the global `0..total_seeds` order and only
//! filters by ownership, cancellation points and merged results keep matching a
//! single-threaded [`crate::drive_run`].

use serde::{Deserialize, Serialize};
use std::fmt;

/// Number of slots in the fixed partition ring.
///
/// A power of two, so splitting it across any worker count stays exact, and
/// large enough that boundaries can be subdivided many times (worker counts up
/// to [`RING_SIZE`]) while collisions on the ring stay rare.
pub const RING_SIZE: u64 = 65_536;

/// splitmix64 finalizer: a stable, allocation-free 64-bit mixer.
///
/// Pure integer arithmetic, so the result is identical on every platform and
/// Rust version (the same determinism the rest of CrashLab relies on).
const fn mix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Stable ring slot for a global seed index.
///
/// This is a pure function of `seed_index`: independent of the worker count,
/// of the schedule length, and of any checkpoint state, so `ring_slot(i)` is
/// identical on every resumed or rescaled run.
pub const fn ring_slot(seed_index: u64) -> u64 {
    mix64(seed_index) % RING_SIZE
}

/// Half-open range `[start, end)` of ring slots.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RingRange {
    pub start: u64,
    pub end: u64,
}

impl RingRange {
    pub const fn new(start: u64, end: u64) -> Self {
        Self { start, end }
    }

    pub const fn len(&self) -> u64 {
        self.end.saturating_sub(self.start)
    }

    pub const fn is_empty(&self) -> bool {
        self.end <= self.start
    }

    pub const fn contains(&self, slot: u64) -> bool {
        slot >= self.start && slot < self.end
    }

    /// Overlap of two ranges, or `None` when they are disjoint.
    pub fn intersection(&self, other: &RingRange) -> Option<RingRange> {
        let start = self.start.max(other.start);
        let end = self.end.min(other.end);
        if start < end {
            Some(RingRange::new(start, end))
        } else {
            None
        }
    }

    pub fn is_subset_of(&self, other: &RingRange) -> bool {
        other.start <= self.start && self.end <= other.end
    }
}

/// Sorted, normalized set of covered ring ranges.
///
/// Invariant: `ranges` is ordered by `start`, every range is non-empty, and no
/// two ranges overlap or merely touch (touching ranges are coalesced). That
/// keeps membership checks and range subtraction cheap and deterministic, and
/// makes the serialized checkpoint small even after many resumes.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RingCoverage {
    ranges: Vec<RingRange>,
}

impl RingCoverage {
    pub const fn new() -> Self {
        Self { ranges: Vec::new() }
    }

    /// Builds coverage from arbitrary (possibly overlapping/unsorted) ranges.
    pub fn from_ranges(ranges: &[RingRange]) -> Self {
        let mut coverage = Self::new();
        for range in ranges {
            coverage.mark_range(*range);
        }
        coverage
    }

    pub fn is_empty(&self) -> bool {
        self.ranges.is_empty()
    }

    /// Normalized covered ranges, ordered by `start`.
    pub fn ranges(&self) -> &[RingRange] {
        &self.ranges
    }

    /// Total number of covered ring slots.
    pub fn covered_slot_count(&self) -> u64 {
        self.ranges.iter().map(RingRange::len).sum()
    }

    pub fn is_slot_covered(&self, slot: u64) -> bool {
        self.ranges.iter().any(|range| range.contains(slot))
    }

    /// True when every slot of `range` is covered.
    pub fn is_range_covered(&self, range: &RingRange) -> bool {
        self.uncovered_within(range).is_empty()
    }

    /// Marks `range` covered, coalescing with overlapping or touching ranges.
    pub fn mark_range(&mut self, range: RingRange) {
        if range.is_empty() {
            return;
        }
        let mut merged = range;
        let mut out: Vec<RingRange> = Vec::with_capacity(self.ranges.len() + 1);
        for existing in self.ranges.drain(..) {
            if existing.end < merged.start || existing.start > merged.end {
                out.push(existing);
            } else {
                merged = RingRange::new(
                    merged.start.min(existing.start),
                    merged.end.max(existing.end),
                );
            }
        }
        out.push(merged);
        out.sort_by_key(|range| range.start);
        self.ranges = out;
    }

    pub fn mark_slot(&mut self, slot: u64) {
        self.mark_range(RingRange::new(slot, slot + 1));
    }

    /// Marks a batch of (possibly unsorted, possibly duplicated) slots covered.
    ///
    /// Slots are coalesced into contiguous runs first so a long sweep costs one
    /// merge per run instead of one merge per slot.
    pub fn mark_slots<I>(&mut self, slots: I)
    where
        I: IntoIterator<Item = u64>,
    {
        let mut slots: Vec<u64> = slots.into_iter().collect();
        slots.sort_unstable();
        slots.dedup();

        let mut iter = slots.into_iter();
        let Some(first) = iter.next() else {
            return;
        };
        let mut run_start = first;
        let mut run_end = first + 1;
        for slot in iter {
            if slot == run_end {
                run_end = slot + 1;
            } else {
                self.mark_range(RingRange::new(run_start, run_end));
                run_start = slot;
                run_end = slot + 1;
            }
        }
        self.mark_range(RingRange::new(run_start, run_end));
    }

    /// Returns `self` plus `other`, without mutating either input.
    pub fn union(&self, other: &RingCoverage) -> RingCoverage {
        let mut merged = self.clone();
        for range in &other.ranges {
            merged.mark_range(*range);
        }
        merged
    }

    /// The portions of `range` that are not yet covered.
    ///
    /// The returned ranges are disjoint, ordered, and their union is exactly
    /// `range` minus the covered set. A resize uses this to claim only the work
    /// no worker has finished yet.
    pub fn uncovered_within(&self, range: &RingRange) -> Vec<RingRange> {
        let mut uncovered = Vec::new();
        if range.is_empty() {
            return uncovered;
        }

        let mut cursor = range.start;
        for covered in &self.ranges {
            if covered.end <= cursor {
                continue;
            }
            if covered.start >= range.end {
                break;
            }
            if covered.start > cursor {
                uncovered.push(RingRange::new(cursor, covered.start.min(range.end)));
            }
            cursor = cursor.max(covered.end.min(range.end));
            if cursor >= range.end {
                break;
            }
        }
        if cursor < range.end {
            uncovered.push(RingRange::new(cursor, range.end));
        }
        uncovered
    }
}

/// Contiguous ring range owned by worker `worker_index` of `num_workers`.
///
/// Returns `None` for `num_workers == 0` or an out-of-range worker index. The
/// first `RING_SIZE % num_workers` workers receive one extra slot, so for every
/// valid `num_workers` the returned ranges are pairwise disjoint and cover
/// exactly `0..RING_SIZE`.
pub fn ring_range_for(worker_index: u32, num_workers: u32) -> Option<RingRange> {
    if num_workers == 0 || worker_index >= num_workers {
        return None;
    }
    let count = num_workers as u64;
    let base = RING_SIZE / count;
    let remainder = RING_SIZE % count;
    let index = worker_index as u64;
    let start = index * base + index.min(remainder);
    let len = base + u64::from(index < remainder);
    Some(RingRange::new(start, start + len))
}

/// Every worker's ring range, in worker order.
pub fn ring_ranges_for(num_workers: u32) -> Vec<RingRange> {
    (0..num_workers)
        .filter_map(|worker| ring_range_for(worker, num_workers))
        .collect()
}

/// Identifies one worker in a fixed-size pool using ring partitioning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkerPartition {
    worker_index: u32,
    num_workers: u32,
    range: RingRange,
}

/// Invalid [`WorkerPartition`] configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkerPartitionError {
    /// `num_workers` must be positive.
    ZeroWorkers,
    /// `worker_index` must be strictly less than `num_workers`.
    WorkerIndexOutOfRange { worker_index: u32, num_workers: u32 },
}

impl fmt::Display for WorkerPartitionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkerPartitionError::ZeroWorkers => write!(f, "num_workers must be at least 1"),
            WorkerPartitionError::WorkerIndexOutOfRange {
                worker_index,
                num_workers,
            } => write!(
                f,
                "worker_index {worker_index} must be less than num_workers {num_workers}"
            ),
        }
    }
}

impl std::error::Error for WorkerPartitionError {}

impl WorkerPartition {
    /// Builds a partition after validating `worker_index < num_workers` and `num_workers > 0`.
    pub fn try_new(worker_index: u32, num_workers: u32) -> Result<Self, WorkerPartitionError> {
        if num_workers == 0 {
            return Err(WorkerPartitionError::ZeroWorkers);
        }
        if worker_index >= num_workers {
            return Err(WorkerPartitionError::WorkerIndexOutOfRange {
                worker_index,
                num_workers,
            });
        }
        let range = ring_range_for(worker_index, num_workers)
            .expect("validated worker configuration always yields a ring range");
        Ok(Self {
            worker_index,
            num_workers,
            range,
        })
    }

    /// Single-worker mode: owns the entire ring (same as `num_workers == 1`).
    pub const fn single_worker() -> Self {
        Self {
            worker_index: 0,
            num_workers: 1,
            range: RingRange::new(0, RING_SIZE),
        }
    }

    pub const fn worker_index(&self) -> u32 {
        self.worker_index
    }

    pub const fn num_workers(&self) -> u32 {
        self.num_workers
    }

    /// Contiguous ring range this worker owns.
    pub const fn ring_range(&self) -> RingRange {
        self.range
    }

    /// Whether this worker owns the given ring `slot`.
    pub const fn owns_slot(&self, slot: u64) -> bool {
        self.range.contains(slot)
    }

    /// Whether this worker executes the given global `seed_index`.
    pub fn owns_seed(&self, seed_index: u64) -> bool {
        self.owns_slot(ring_slot(seed_index))
    }

    /// Ascending global indices in `0..total_seeds` assigned to this worker.
    pub fn seed_indices(&self, total_seeds: u64) -> impl Iterator<Item = u64> + '_ {
        (0..total_seeds).filter(move |&i| self.owns_seed(i))
    }

    /// Number of seeds in `0..total_seeds` owned by this worker.
    pub fn seed_count(&self, total_seeds: u64) -> u64 {
        (0..total_seeds).filter(|&i| self.owns_seed(i)).count() as u64
    }
}

/// Which worker owns `seed_index` under ring partitioning, or `None` if `num_workers == 0`.
///
/// Derived from the same `base`/`remainder` split as [`ring_range_for`], so the
/// two always agree.
pub fn worker_for_seed(seed_index: u64, num_workers: u32) -> Option<u32> {
    if num_workers == 0 {
        return None;
    }
    let slot = ring_slot(seed_index);
    let count = num_workers as u64;
    let base = RING_SIZE / count;
    let remainder = RING_SIZE % count;

    if base == 0 {
        // More workers than slots: the first `remainder` workers own one slot
        // each and every later worker owns an empty range.
        if slot < remainder {
            Some(slot as u32)
        } else {
            None
        }
    } else {
        let large = base + 1;
        let large_span = remainder * large;
        if slot < large_span {
            Some((slot / large) as u32)
        } else {
            Some((remainder + (slot - large_span) / base) as u32)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_new_rejects_zero_workers() {
        assert_eq!(
            WorkerPartition::try_new(0, 0).err(),
            Some(WorkerPartitionError::ZeroWorkers)
        );
    }

    #[test]
    fn try_new_rejects_worker_index_out_of_range() {
        assert_eq!(
            WorkerPartition::try_new(3, 3).err(),
            Some(WorkerPartitionError::WorkerIndexOutOfRange {
                worker_index: 3,
                num_workers: 3,
            })
        );
    }

    #[test]
    fn partitions_are_disjoint_and_cover_all_indices() {
        let total = 100u64;
        let n = 7u32;
        let mut seen = vec![false; total as usize];
        for w in 0..n {
            let p = WorkerPartition::try_new(w, n).expect("partition");
            for i in p.seed_indices(total) {
                assert!(!seen[i as usize], "index {i} assigned twice");
                seen[i as usize] = true;
                assert_eq!(worker_for_seed(i, n), Some(w));
            }
        }
        assert!(seen.iter().all(|&b| b));
    }

    #[test]
    fn single_worker_owns_every_index() {
        let p = WorkerPartition::single_worker();
        assert_eq!(p.num_workers(), 1);
        assert_eq!(p.ring_range(), RingRange::new(0, RING_SIZE));
        for i in 0..20u64 {
            assert!(p.owns_seed(i));
        }
    }

    #[test]
    fn seed_counts_sum_to_total() {
        let total = 50u64;
        let n = 6u32;
        let sum: u64 = (0..n)
            .map(|w| {
                WorkerPartition::try_new(w, n)
                    .expect("partition")
                    .seed_count(total)
            })
            .sum();
        assert_eq!(sum, total);
    }

    #[test]
    fn merged_partition_results_match_sequential_replay() {
        use crate::{classify, mutate_seed, CaseSeed};

        let total = 40u64;
        let n = 5u32;

        let sequential: Vec<u64> = (0..total)
            .map(|i| {
                let seed = CaseSeed {
                    id: i,
                    payload: vec![i as u8; 3],
                };
                classify(&mutate_seed(&seed)).signature_hash
            })
            .collect();

        let mut parallel: Vec<(u64, u64)> = Vec::new();
        for w in 0..n {
            let p = WorkerPartition::try_new(w, n).expect("partition");
            for i in p.seed_indices(total) {
                let seed = CaseSeed {
                    id: i,
                    payload: vec![i as u8; 3],
                };
                let h = classify(&mutate_seed(&seed)).signature_hash;
                parallel.push((i, h));
            }
        }
        parallel.sort_by_key(|x| x.0);
        let merged: Vec<u64> = parallel.into_iter().map(|(_, h)| h).collect();

        assert_eq!(merged, sequential);
    }

    // ── ring stability properties ────────────────────────────────────────────

    #[test]
    fn ring_slot_is_pure_and_in_range() {
        for i in 0..2_000u64 {
            let slot = ring_slot(i);
            assert!(slot < RING_SIZE, "slot {slot} out of range for seed {i}");
            assert_eq!(ring_slot(i), slot, "ring_slot must be deterministic");
        }
    }

    #[test]
    fn worker_ranges_partition_the_full_ring_for_any_count() {
        for n in 1..=32u32 {
            let ranges = ring_ranges_for(n);
            assert_eq!(ranges.len(), n as usize);

            let mut cursor = 0u64;
            let mut total = 0u64;
            for range in &ranges {
                assert_eq!(range.start, cursor, "ranges not contiguous for n={n}");
                assert!(!range.is_empty(), "empty range for n={n}");
                total += range.len();
                cursor = range.end;
            }
            assert_eq!(total, RING_SIZE, "union must cover the full ring for n={n}");
            assert_eq!(cursor, RING_SIZE);
        }
    }

    #[test]
    fn worker_ranges_are_pairwise_disjoint_for_any_count() {
        for n in 1..=16u32 {
            let ranges = ring_ranges_for(n);
            for (index, a) in ranges.iter().enumerate() {
                for b in ranges.iter().skip(index + 1) {
                    assert!(
                        a.intersection(b).is_none(),
                        "ranges overlap for n={n}: {a:?} vs {b:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_seed_keeps_one_owner_when_the_worker_count_changes() {
        // The slot is fixed, so a resize only moves boundaries; the seed is
        // never re-derived from `i % num_workers`.
        for seed in [0u64, 7, 42, 1_234, 65_535] {
            let slot = ring_slot(seed);
            for n in 1..=16u32 {
                let owner = worker_for_seed(seed, n).expect("owner exists");
                let range = ring_range_for(owner, n).expect("range exists");
                assert!(range.contains(slot), "owner range must contain the slot");
                let owners: Vec<u32> = (0..n)
                    .filter(|&w| {
                        WorkerPartition::try_new(w, n)
                            .expect("partition")
                            .owns_seed(seed)
                    })
                    .collect();
                assert_eq!(
                    owners,
                    vec![owner],
                    "exactly one owner for seed {seed}, n={n}"
                );
            }
        }
    }

    #[test]
    fn worker_for_seed_matches_range_ownership() {
        for n in 1..=24u32 {
            for seed in 0..300u64 {
                let owner = worker_for_seed(seed, n).expect("owner");
                let range = ring_range_for(owner, n).expect("range");
                assert!(range.contains(ring_slot(seed)));
            }
        }
    }

    #[test]
    fn worker_for_seed_yields_none_beyond_the_ring_when_workers_outnumber_slots() {
        // Every ring slot is owned by exactly one worker, but once the worker
        // count exceeds the ring size the extra workers own nothing.
        let n = RING_SIZE as u32 + 5;
        let owned: Vec<u32> = ring_ranges_for(n)
            .iter()
            .enumerate()
            .filter(|(_, range)| !range.is_empty())
            .map(|(index, _)| index as u32)
            .collect();
        assert_eq!(owned.len(), RING_SIZE as usize);
        assert!(
            ring_range_for(RING_SIZE as u32, n).is_none()
                || ring_range_for(RING_SIZE as u32, n)
                    .expect("range")
                    .is_empty()
        );
    }

    // ── ring coverage properties ─────────────────────────────────────────────

    #[test]
    fn ring_coverage_marks_and_subtracts_ranges() {
        let mut coverage = RingCoverage::new();
        coverage.mark_range(RingRange::new(10, 20));
        coverage.mark_slot(25);
        // Touching the previous range must coalesce.
        coverage.mark_slot(20);

        assert!(coverage.is_slot_covered(10));
        assert!(coverage.is_slot_covered(19));
        assert!(coverage.is_slot_covered(20));
        assert!(!coverage.is_slot_covered(21));
        assert!(coverage.is_slot_covered(25));
        assert_eq!(coverage.covered_slot_count(), 12);
        assert_eq!(
            coverage.ranges(),
            &[RingRange::new(10, 21), RingRange::new(25, 26)]
        );

        let pending = coverage.uncovered_within(&RingRange::new(15, 30));
        assert_eq!(
            pending,
            vec![RingRange::new(21, 25), RingRange::new(26, 30)]
        );
        for range in &pending {
            assert!(!coverage.is_range_covered(range));
        }
    }

    #[test]
    fn mark_slots_coalesces_contiguous_runs() {
        let mut coverage = RingCoverage::new();
        coverage.mark_slots(vec![5, 3, 4, 4, 9]);
        assert_eq!(
            coverage.ranges(),
            &[RingRange::new(3, 6), RingRange::new(9, 10)]
        );
        assert_eq!(coverage.covered_slot_count(), 4);
    }

    #[test]
    fn uncovered_within_full_ring_is_the_whole_ring() {
        let coverage = RingCoverage::new();
        assert_eq!(
            coverage.uncovered_within(&RingRange::new(0, RING_SIZE)),
            vec![RingRange::new(0, RING_SIZE)]
        );
    }

    #[test]
    fn resized_coverage_is_disjoint_and_leaves_no_hole() {
        // Property required by the issue: for every (old_count, new_count) pair,
        // re-claiming the ring after a resize is disjoint (no double execution)
        // and, together with the previously covered slots, covers the full ring
        // (no hole).
        for old_count in 1..=6u32 {
            for new_count in 1..=6u32 {
                // Simulate a partially finished old pass: worker 0 of the old
                // pool is fully covered, everything else is still pending.
                let old_range = ring_range_for(0, old_count).expect("old range");
                let already_covered = RingCoverage::from_ranges(&[old_range]);

                let mut coverage = already_covered.clone();
                let mut claimed: Vec<RingRange> = Vec::new();
                for w in 0..new_count {
                    let range = ring_range_for(w, new_count).expect("new range");
                    for pending in already_covered.uncovered_within(&range) {
                        assert!(!pending.is_empty(), "pending range must be non-empty");
                        for previous in &claimed {
                            assert!(
                                previous.intersection(&pending).is_none(),
                                "resize double-claims slots (old={old_count}, new={new_count})"
                            );
                        }
                        claimed.push(pending);
                        coverage.mark_range(pending);
                    }
                }
                assert_eq!(
                    coverage.covered_slot_count(),
                    RING_SIZE,
                    "resize left a coverage hole (old={old_count}, new={new_count})"
                );
            }
        }
    }
}
