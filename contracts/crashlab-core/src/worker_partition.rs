//! Deterministic assignment of global seed indices to parallel workers.
//!
//! Worker `w` of `num_workers` runs seed index `i` iff `i % num_workers == w`.
//! The global order `0..total_seeds` is fixed, so replay can merge worker-local
//! results sorted by index and match a single-threaded run.

use std::fmt;

/// Identifies one worker in a fixed-size pool using modulo partitioning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkerPartition {
    worker_index: u32,
    num_workers: u32,
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
        Ok(Self {
            worker_index,
            num_workers,
        })
    }

    /// Single-worker mode: processes every index in `0..total_seeds` (same as `num_workers == 1`).
    pub const fn single_worker() -> Self {
        Self {
            worker_index: 0,
            num_workers: 1,
        }
    }

    pub const fn worker_index(&self) -> u32 {
        self.worker_index
    }

    pub const fn num_workers(&self) -> u32 {
        self.num_workers
    }

    /// Whether this worker executes the given global `seed_index`.
    pub fn owns_seed(&self, seed_index: u64) -> bool {
        seed_index % self.num_workers as u64 == self.worker_index as u64
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

/// Which worker owns `seed_index` under modulo partitioning, or `None` if `num_workers == 0`.
pub fn worker_for_seed(seed_index: u64, num_workers: u32) -> Option<u32> {
    if num_workers == 0 {
        return None;
    }
    Some((seed_index % num_workers as u64) as u32)
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
}
