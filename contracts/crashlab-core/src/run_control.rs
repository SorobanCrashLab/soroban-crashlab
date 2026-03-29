//! Cooperative run lifecycle and cancellation for long-running fuzz campaigns.
//!
//! Runs check [`CancelSignal`] between iterations so maintainers can stop work
//! gracefully. The same signal can be driven in-process ([`CancelSignal::new`])
//! or via [`request_cancel_run`] / [`cancel_requested`] when the runner and the
//! `crashlab run cancel` CLI use a shared state directory.
//!
//! Use [`drive_run_partitioned`] with [`crate::worker_partition::WorkerPartition`] to
//! execute only the seed indices assigned to one worker while preserving the same
//! global iteration order and cancellation points as [`drive_run`].

use crate::worker_partition::WorkerPartition;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Opaque identifier for an active or completed run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct RunId(pub u64);

/// Summary emitted when a run stops; partial counts are valid for cancellation.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RunSummary {
    /// Seeds fully processed before the run ended.
    pub seeds_processed: u64,
    /// When cancelled, the seed id at which cancellation was observed (if known).
    pub cancelled_at_seed: Option<u64>,
}

/// Terminal state for a fuzz campaign run.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum RunTerminalState {
    Completed { summary: RunSummary },
    Cancelled { summary: RunSummary },
    Failed { message: String },
}

/// Deterministic worker partitioning for parallel execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct WorkerPartition {
    pub index: u64,
    pub total: u64,
}

impl WorkerPartition {
    /// Creates a new `WorkerPartition`. Panics if `total == 0` or `index >= total`.
    pub fn new(index: u64, total: u64) -> Self {
        assert!(total > 0, "total workers must be greater than 0");
        assert!(index < total, "worker index must be less than total workers");
        Self { index, total }
    }

    /// Returns true if this worker is responsible for the given seed index.
    pub const fn owns(&self, seed_index: u64) -> bool {
        (seed_index % self.total) == self.index
    }
}

/// Cooperative cancellation: in-process flag plus optional on-disk marker.
#[derive(Clone, Debug)]
pub struct CancelSignal {
    flag: Arc<AtomicBool>,
    run_id: RunId,
    state_dir: PathBuf,
}

impl CancelSignal {
    /// In-process cancellation only (no file I/O).
    pub fn new(run_id: RunId) -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
            run_id,
            state_dir: PathBuf::new(),
        }
    }

    /// Full signal with a state directory for [`request_cancel_run`] / polling.
    pub fn with_state_dir(run_id: RunId, state_dir: impl AsRef<Path>) -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
            run_id,
            state_dir: state_dir.as_ref().to_path_buf(),
        }
    }

    pub fn run_id(&self) -> RunId {
        self.run_id
    }

    /// Request cancellation (same effect as the CLI cancel command).
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
        if !self.state_dir.as_os_str().is_empty() {
            let _ = request_cancel_run(self.run_id, &self.state_dir);
        }
    }

    /// Returns true after [`CancelSignal::cancel`], [`request_cancel_run`], or a CLI cancel.
    pub fn is_cancelled(&self) -> bool {
        if self.flag.load(Ordering::SeqCst) {
            return true;
        }
        if self.state_dir.as_os_str().is_empty() {
            return false;
        }
        cancel_requested(self.run_id, &self.state_dir)
    }
}

/// Default directory for run state (override with `CRASHLAB_STATE_DIR`).
pub fn default_state_dir() -> PathBuf {
    std::env::var("CRASHLAB_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".crashlab"))
}

/// Path to the on-disk cancel marker for `run_id` under `base`.
pub fn cancel_marker_path(run_id: RunId, base: impl AsRef<Path>) -> PathBuf {
    let base = base.as_ref();
    base.join("runs").join(run_id.0.to_string()).join("cancel")
}

fn cancel_file_path(run_id: RunId, base: &Path) -> PathBuf {
    cancel_marker_path(run_id, base)
}

/// Creates the cancel marker on disk so a running worker can observe it.
pub fn request_cancel_run(run_id: RunId, base: impl AsRef<Path>) -> io::Result<()> {
    let path = cancel_file_path(run_id, base.as_ref());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, b"1")
}

/// Returns true if cancellation was requested for `run_id` under `base`.
pub fn cancel_requested(run_id: RunId, base: impl AsRef<Path>) -> bool {
    cancel_file_path(run_id, base.as_ref()).exists()
}

/// Removes the cancel marker (e.g. after handling or for tests).
pub fn clear_cancel_request(run_id: RunId, base: impl AsRef<Path>) -> io::Result<()> {
    let path = cancel_file_path(run_id, base.as_ref());
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Runs `work` for each seed index in `0..total`, stopping early when `signal` fires.
/// If `partition` is provided, only seeds owned by that partition are processed, but
/// `total_seeds` is evaluated completely for cancellation reasons.
/// Returns [`RunTerminalState::Cancelled`] with a partial summary, or [`RunTerminalState::Completed`].
pub fn drive_run<F>(
    _run_id: RunId,
    total_seeds: u64,
    signal: &CancelSignal,
    partition: Option<WorkerPartition>,
    mut work: F,
) -> RunTerminalState
where
    F: FnMut(u64) -> Result<(), String>,
{
    let mut seeds_processed = 0u64;
    for seed_index in 0..total_seeds {
        if let Some(p) = &partition {
            if !p.owns(seed_index) {
                continue;
            }
        }

        if signal.is_cancelled() {
            return RunTerminalState::Cancelled {
                summary: RunSummary {
                    seeds_processed,
                    cancelled_at_seed: Some(seed_index),
                },
            };
        }
        if let Err(message) = work(seed_index) {
            return RunTerminalState::Failed { message };
        }
        seeds_processed += 1;
    }

    RunTerminalState::Completed {
        summary: RunSummary {
            seeds_processed,
            cancelled_at_seed: None,
        },
    }
}

/// Like [`drive_run`], but invokes `work` only for global seed indices owned by `partition`
/// (`seed_index % num_workers == worker_index`). Still walks `0..total_seeds` in order so
/// cancellation checks align with the single-worker timeline.
pub fn drive_run_partitioned<F>(
    _run_id: RunId,
    total_seeds: u64,
    partition: &WorkerPartition,
    signal: &CancelSignal,
    mut work: F,
) -> RunTerminalState
where
    F: FnMut(u64) -> Result<(), String>,
{
    let mut seeds_processed = 0u64;
    for seed_index in 0..total_seeds {
        if signal.is_cancelled() {
            return RunTerminalState::Cancelled {
                summary: RunSummary {
                    seeds_processed,
                    cancelled_at_seed: Some(seed_index),
                },
            };
        }
        if !partition.owns_seed(seed_index) {
            continue;
        }
        if let Err(message) = work(seed_index) {
            return RunTerminalState::Failed { message };
        }
        seeds_processed += 1;
    }

    RunTerminalState::Completed {
        summary: RunSummary {
            seeds_processed,
            cancelled_at_seed: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worker_partition::WorkerPartition;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_tmp() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("crashlab-run-{n}"))
    }

    #[test]
    fn cancel_signal_in_process_stops_drive_run() {
        let id = RunId(1);
        let signal = CancelSignal::new(id);
        signal.cancel();

        let outcome = drive_run(id, 100, &signal, None, |_i| Ok(()));
        match outcome {
            RunTerminalState::Cancelled { summary } => {
                assert_eq!(summary.seeds_processed, 0);
                assert_eq!(summary.cancelled_at_seed, Some(0));
            }
            other => panic!("expected cancelled, got {other:?}"),
        }
    }

    #[test]
    fn drive_run_completes_when_not_cancelled() {
        let id = RunId(2);
        let signal = CancelSignal::new(id);
        let mut seen = 0u64;
        let outcome = drive_run(id, 5, &signal, None, |_i| {
            seen += 1;
            Ok(())
        });
        match outcome {
            RunTerminalState::Completed { summary } => {
                assert_eq!(summary.seeds_processed, 5);
                assert_eq!(seen, 5);
            }
            other => panic!("expected completed, got {other:?}"),
        }
    }

    #[test]
    fn request_cancel_run_sets_cancel_requested() {
        let base = unique_tmp();
        let id = RunId(99);
        request_cancel_run(id, &base).expect("request");
        assert!(cancel_requested(id, &base));
        clear_cancel_request(id, &base).expect("clear");
        assert!(!cancel_requested(id, &base));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn file_cancel_observed_by_signal_without_in_process_flag() {
        let base = unique_tmp();
        let id = RunId(7);
        request_cancel_run(id, &base).expect("request");
        let signal = CancelSignal::with_state_dir(id, &base);
        assert!(signal.is_cancelled());
        clear_cancel_request(id, &base).expect("clear");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn drive_run_picks_up_mid_run_file_cancel() {
        let base = unique_tmp();
        let id = RunId(3);
        let signal = CancelSignal::with_state_dir(id, &base);

        let outcome = drive_run(id, 10, &signal, None, |i| {
            if i == 2 {
                request_cancel_run(id, &base).expect("request cancel");
            }
            Ok(())
        });

        match outcome {
            RunTerminalState::Cancelled { summary } => {
                assert_eq!(summary.cancelled_at_seed, Some(3));
            }
            other => panic!("expected cancelled, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&base);
    }
    
    #[test]
    fn drive_run_respects_worker_partition() {
        let id = RunId(4);
        let signal = CancelSignal::new(id);
        
        let partition = WorkerPartition::new(1, 3);
        
        let mut seen = Vec::new();
        let outcome = drive_run(id, 10, &signal, Some(partition), |i| {
            seen.push(i);
            Ok(())
        });
        
        match outcome {
            RunTerminalState::Completed { summary } => {
                // 10 seeds: 0..9.
                // Mod 3 gives:
                // 0 -> 0
                // 1 -> 1 *
                // 2 -> 2
                // 3 -> 0
                // 4 -> 1 *
                // 5 -> 2
                // 6 -> 0
                // 7 -> 1 *
                // 8 -> 2
                // 9 -> 0
                assert_eq!(summary.seeds_processed, 3);
                assert_eq!(seen, vec![1, 4, 7]);
            }
            other => panic!("expected completed, got {other:?}"),

    #[test]
    fn drive_run_partitioned_matches_seed_count_per_worker() {
        let id = RunId(8);
        let signal = CancelSignal::new(id);
        let total = 23u64;
        let n = 4u32;

        let mut per_worker = vec![0u64; n as usize];
        for w in 0..n {
            let p = WorkerPartition::try_new(w, n).expect("partition");
            let outcome = drive_run_partitioned(id, total, &p, &signal, |_i| Ok(()));
            match outcome {
                RunTerminalState::Completed { summary } => {
                    per_worker[w as usize] = summary.seeds_processed;
                }
                other => panic!("expected completed, got {other:?}"),
            }
        }

        assert_eq!(per_worker.iter().sum::<u64>(), total);
    }

    #[test]
    fn drive_run_partitioned_observes_cancel_at_global_index() {
        let id = RunId(11);
        let signal = CancelSignal::new(id);
        signal.cancel();

        // Worker 1 of 3: owns indices 1, 4, 7, ... — first iteration is global index 0 (skip), then 1 (work).
        let p = WorkerPartition::try_new(1, 3).expect("partition");
        let outcome = drive_run_partitioned(id, 20, &p, &signal, |_i| Ok(()));
        match outcome {
            RunTerminalState::Cancelled { summary } => {
                assert_eq!(summary.seeds_processed, 0);
                assert_eq!(summary.cancelled_at_seed, Some(0));
            }
            other => panic!("expected cancelled, got {other:?}"),
        }
    }
}
