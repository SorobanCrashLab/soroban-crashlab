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

use crate::checkpoint::{CheckpointError, RunCheckpoint};
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

/// Validation failures when resuming a run from a persisted checkpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunResumeError {
    /// The persisted checkpoint cannot be applied to the requested campaign/schedule.
    Checkpoint(CheckpointError),
    /// `total_seeds` could not be represented as a checkpoint length on this platform.
    TotalSeedsOverflow { total_seeds: u64 },
}

impl std::fmt::Display for RunResumeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunResumeError::Checkpoint(err) => err.fmt(f),
            RunResumeError::TotalSeedsOverflow { total_seeds } => write!(
                f,
                "total_seeds {total_seeds} exceeds the supported checkpoint range on this platform"
            ),
        }
    }
}

impl std::error::Error for RunResumeError {}

impl From<CheckpointError> for RunResumeError {
    fn from(value: CheckpointError) -> Self {
        Self::Checkpoint(value)
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

/// Observer for a drive loop's progress (#1593).
///
/// The drive loops are the only place that knows where a campaign is, so they
/// report it here rather than leaving operators blind between the start and the
/// final summary. Implementations must not panic and should stay cheap:
/// [`RunProgress::on_seed_processed`] runs once per completed seed.
///
/// [`CampaignHealth`](crate::health_snapshot::CampaignHealth) implements this to
/// turn the callbacks into periodic, versioned health snapshots.
pub trait RunProgress {
    /// A seed's `work` returned `Ok`. `seeds_processed` counts the seeds this
    /// loop completed; indices owned by another partition are not counted.
    fn on_seed_processed(&mut self, seed_index: u64, seeds_processed: u64);

    /// `work` returned `Err` for `seed_index`; the loop is about to stop.
    fn on_failure(&mut self, seed_index: u64, message: &str);

    /// The loop stopped, whatever the reason. Called exactly once per entered
    /// loop, after the last seed callback.
    fn on_finish(&mut self, seeds_processed: u64, terminal: &RunTerminalState);
}

/// A [`RunProgress`] that discards every callback.
///
/// The plain `drive_run*` functions use this, which is why they keep their
/// original signatures and report nothing.
#[derive(Debug, Default, Clone, Copy)]
pub struct IgnoreProgress;

impl RunProgress for IgnoreProgress {
    fn on_seed_processed(&mut self, _seed_index: u64, _seeds_processed: u64) {}
    fn on_failure(&mut self, _seed_index: u64, _message: &str) {}
    fn on_finish(&mut self, _seeds_processed: u64, _terminal: &RunTerminalState) {}
}

/// Shared body of every drive loop.
///
/// `start_index` is `0` for a fresh run and `checkpoint.next_seed_index` for a
/// resumed one. When `checkpoint` is present it is advanced past every index the
/// loop finishes with, including the indices this worker does not own, so a
/// resumed worker never rescans the global timeline.
fn drive_loop<F>(
    start_index: u64,
    total_seeds: u64,
    signal: &CancelSignal,
    partition: Option<&WorkerPartition>,
    mut checkpoint: Option<&mut RunCheckpoint>,
    progress: &mut dyn RunProgress,
    work: &mut F,
) -> RunTerminalState
where
    F: FnMut(u64) -> Result<(), String>,
{
    let mut seeds_processed = 0u64;

    for seed_index in start_index..total_seeds {
        if signal.is_cancelled() {
            let terminal = RunTerminalState::Cancelled {
                summary: RunSummary {
                    seeds_processed,
                    cancelled_at_seed: Some(seed_index),
                },
            };
            progress.on_finish(seeds_processed, &terminal);
            return terminal;
        }

        if let Some(p) = partition {
            if !p.owns_seed(seed_index) {
                if let Some(cp) = checkpoint.as_mut() {
                    cp.next_seed_index = seed_index as usize + 1;
                }
                continue;
            }
        }

        if let Err(message) = work(seed_index) {
            progress.on_failure(seed_index, &message);
            let terminal = RunTerminalState::Failed { message };
            progress.on_finish(seeds_processed, &terminal);
            return terminal;
        }

        // Advanced only after the seed is fully accounted for, so cancellation
        // and failure leave the next unprocessed seed in place for a retry.
        if let Some(cp) = checkpoint.as_mut() {
            cp.next_seed_index = seed_index as usize + 1;
        }
        seeds_processed += 1;
        progress.on_seed_processed(seed_index, seeds_processed);
    }

    let terminal = RunTerminalState::Completed {
        summary: RunSummary {
            seeds_processed,
            cancelled_at_seed: None,
        },
    };
    progress.on_finish(seeds_processed, &terminal);
    terminal
}

/// Runs `work` for each seed index in `0..total`, stopping early when `signal` fires.
/// If `partition` is provided, only seeds owned by that partition are processed, but
/// `total_seeds` is evaluated completely for cancellation reasons.
/// Returns [`RunTerminalState::Cancelled`] with a partial summary, or [`RunTerminalState::Completed`].
///
/// Reports nothing; use [`drive_run_with_health`] to observe the run.
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
    drive_loop(
        0,
        total_seeds,
        signal,
        partition.as_ref(),
        None,
        &mut IgnoreProgress,
        &mut work,
    )
}

/// [`drive_run`], reporting progress to `progress`.
///
/// The callbacks are the only signal a long campaign produces while it runs, so
/// a panic-free, cheap implementation matters more here than elsewhere.
pub fn drive_run_with_health<F>(
    _run_id: RunId,
    total_seeds: u64,
    signal: &CancelSignal,
    partition: Option<WorkerPartition>,
    mut work: F,
    progress: &mut dyn RunProgress,
) -> RunTerminalState
where
    F: FnMut(u64) -> Result<(), String>,
{
    drive_loop(
        0,
        total_seeds,
        signal,
        partition.as_ref(),
        None,
        progress,
        &mut work,
    )
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
    drive_loop(
        0,
        total_seeds,
        signal,
        Some(partition),
        None,
        &mut IgnoreProgress,
        &mut work,
    )
}

/// [`drive_run_partitioned`], reporting progress to `progress`.
pub fn drive_run_partitioned_with_health<F>(
    _run_id: RunId,
    total_seeds: u64,
    partition: &WorkerPartition,
    signal: &CancelSignal,
    mut work: F,
    progress: &mut dyn RunProgress,
) -> RunTerminalState
where
    F: FnMut(u64) -> Result<(), String>,
{
    drive_loop(
        0,
        total_seeds,
        signal,
        Some(partition),
        None,
        progress,
        &mut work,
    )
}

fn validate_resume_checkpoint(
    checkpoint: &RunCheckpoint,
    campaign_id: &str,
    total_seeds: u64,
) -> Result<usize, RunResumeError> {
    let total_seeds = usize::try_from(total_seeds)
        .map_err(|_| RunResumeError::TotalSeedsOverflow { total_seeds })?;
    checkpoint.validate_run(campaign_id, total_seeds)?;
    Ok(total_seeds)
}

/// Resumes a single-worker run from a persisted checkpoint without reprocessing
/// seeds whose indices are already below `checkpoint.next_seed_index`.
///
/// The checkpoint is advanced only after a seed has been fully accounted for, so
/// cancellation and failures leave the next unprocessed seed in place for a later retry.
pub fn drive_run_from_checkpoint<F>(
    _run_id: RunId,
    campaign_id: &str,
    checkpoint: &mut RunCheckpoint,
    total_seeds: u64,
    signal: &CancelSignal,
    mut work: F,
) -> Result<RunTerminalState, RunResumeError>
where
    F: FnMut(u64) -> Result<(), String>,
{
    let total_seeds = validate_resume_checkpoint(checkpoint, campaign_id, total_seeds)? as u64;
    let start_index = checkpoint.next_seed_index as u64;

    Ok(drive_loop(
        start_index,
        total_seeds,
        signal,
        None,
        Some(checkpoint),
        &mut IgnoreProgress,
        &mut work,
    ))
}

/// [`drive_run_from_checkpoint`], reporting progress to `progress`.
///
/// A checkpoint rejected by [`RunResumeError`] returns before the loop starts, so
/// no callback fires in that case.
pub fn drive_run_from_checkpoint_with_health<F>(
    _run_id: RunId,
    campaign_id: &str,
    checkpoint: &mut RunCheckpoint,
    total_seeds: u64,
    signal: &CancelSignal,
    mut work: F,
    progress: &mut dyn RunProgress,
) -> Result<RunTerminalState, RunResumeError>
where
    F: FnMut(u64) -> Result<(), String>,
{
    let total_seeds = validate_resume_checkpoint(checkpoint, campaign_id, total_seeds)? as u64;
    let start_index = checkpoint.next_seed_index as u64;

    Ok(drive_loop(
        start_index,
        total_seeds,
        signal,
        None,
        Some(checkpoint),
        progress,
        &mut work,
    ))
}

/// Resumes a worker-partitioned run from a per-worker checkpoint.
///
/// The checkpoint stores the next global seed index this worker should inspect.
/// Unowned indices are still advanced past so a resumed worker does not rescan
/// earlier parts of the global timeline.
pub fn drive_run_partitioned_from_checkpoint<F>(
    _run_id: RunId,
    campaign_id: &str,
    checkpoint: &mut RunCheckpoint,
    total_seeds: u64,
    partition: &WorkerPartition,
    signal: &CancelSignal,
    mut work: F,
) -> Result<RunTerminalState, RunResumeError>
where
    F: FnMut(u64) -> Result<(), String>,
{
    let total_seeds = validate_resume_checkpoint(checkpoint, campaign_id, total_seeds)? as u64;
    let start_index = checkpoint.next_seed_index as u64;

    Ok(drive_loop(
        start_index,
        total_seeds,
        signal,
        Some(partition),
        Some(checkpoint),
        &mut IgnoreProgress,
        &mut work,
    ))
}

/// [`drive_run_partitioned_from_checkpoint`], reporting progress to `progress`.
///
/// A checkpoint rejected by [`RunResumeError`] returns before the loop starts, so
/// no callback fires in that case.
pub fn drive_run_partitioned_from_checkpoint_with_health<F>(
    _run_id: RunId,
    campaign_id: &str,
    checkpoint: &mut RunCheckpoint,
    total_seeds: u64,
    partition: &WorkerPartition,
    signal: &CancelSignal,
    mut work: F,
    progress: &mut dyn RunProgress,
) -> Result<RunTerminalState, RunResumeError>
where
    F: FnMut(u64) -> Result<(), String>,
{
    let total_seeds = validate_resume_checkpoint(checkpoint, campaign_id, total_seeds)? as u64;
    let start_index = checkpoint.next_seed_index as u64;

    Ok(drive_loop(
        start_index,
        total_seeds,
        signal,
        Some(partition),
        Some(checkpoint),
        progress,
        &mut work,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{worker_partition::WorkerPartition, CaseSeed};
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

        let partition = WorkerPartition::try_new(1, 3).expect("partition");

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
        }
    }

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

    fn seeds(n: usize) -> Vec<CaseSeed> {
        (0..n)
            .map(|i| CaseSeed {
                id: i as u64,
                payload: vec![i as u8],
            })
            .collect()
    }

    #[test]
    fn drive_run_from_checkpoint_skips_completed_seeds() {
        let id = RunId(12);
        let signal = CancelSignal::new(id);
        let seeds = seeds(6);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        checkpoint.advance_by(3);

        let mut seen = Vec::new();
        let outcome = drive_run_from_checkpoint(
            id,
            "campaign-1",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |seed_index| {
                seen.push(seed_index);
                Ok(())
            },
        )
        .expect("resume succeeds");

        match outcome {
            RunTerminalState::Completed { summary } => {
                assert_eq!(summary.seeds_processed, 3);
                assert_eq!(seen, vec![3, 4, 5]);
                assert_eq!(checkpoint.next_seed_index, seeds.len());
            }
            other => panic!("expected completed, got {other:?}"),
        }
    }

    #[test]
    fn drive_run_from_checkpoint_rejects_campaign_mismatch() {
        let id = RunId(13);
        let signal = CancelSignal::new(id);
        let seeds = seeds(3);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);

        let err = drive_run_from_checkpoint(
            id,
            "campaign-2",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |_seed_index| Ok(()),
        )
        .expect_err("campaign mismatch should fail");

        assert!(matches!(
            err,
            RunResumeError::Checkpoint(CheckpointError::CampaignMismatch { .. })
        ));
        assert_eq!(checkpoint.next_seed_index, 0);
    }

    #[test]
    fn drive_run_from_checkpoint_leaves_failed_seed_for_retry() {
        let id = RunId(14);
        let signal = CancelSignal::new(id);
        let seeds = seeds(5);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        checkpoint.advance_by(2);

        let outcome = drive_run_from_checkpoint(
            id,
            "campaign-1",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |seed_index| {
                if seed_index == 3 {
                    return Err("seed 3 failed".to_string());
                }
                Ok(())
            },
        )
        .expect("resume call should validate");

        assert_eq!(
            outcome,
            RunTerminalState::Failed {
                message: "seed 3 failed".to_string()
            }
        );
        assert_eq!(checkpoint.next_seed_index, 3);
    }

    #[test]
    fn drive_run_partitioned_from_checkpoint_uses_global_cursor() {
        let id = RunId(15);
        let signal = CancelSignal::new(id);
        let seeds = seeds(8);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        checkpoint.advance_by(2);
        let partition = WorkerPartition::try_new(1, 3).expect("partition");

        let mut seen = Vec::new();
        let outcome = drive_run_partitioned_from_checkpoint(
            id,
            "campaign-1",
            &mut checkpoint,
            seeds.len() as u64,
            &partition,
            &signal,
            |seed_index| {
                seen.push(seed_index);
                Ok(())
            },
        )
        .expect("resume succeeds");

        match outcome {
            RunTerminalState::Completed { summary } => {
                assert_eq!(summary.seeds_processed, 2);
                assert_eq!(seen, vec![4, 7]);
                assert_eq!(checkpoint.next_seed_index, seeds.len());
            }
            other => panic!("expected completed, got {other:?}"),
        }
    }

    // ── progress reporting (#1593) ────────────────────────────────────────────

    fn terminal_label(terminal: &RunTerminalState) -> &'static str {
        match terminal {
            RunTerminalState::Completed { .. } => "completed",
            RunTerminalState::Cancelled { .. } => "cancelled",
            RunTerminalState::Failed { .. } => "failed",
        }
    }

    /// Captures every callback so the reporting contract can be asserted.
    #[derive(Default)]
    struct RecordingProgress {
        processed: Vec<(u64, u64)>,
        failures: Vec<(u64, String)>,
        finished: Vec<(u64, &'static str)>,
    }

    impl RunProgress for RecordingProgress {
        fn on_seed_processed(&mut self, seed_index: u64, seeds_processed: u64) {
            self.processed.push((seed_index, seeds_processed));
        }

        fn on_failure(&mut self, seed_index: u64, message: &str) {
            self.failures.push((seed_index, message.to_string()));
        }

        fn on_finish(&mut self, seeds_processed: u64, terminal: &RunTerminalState) {
            self.finished
                .push((seeds_processed, terminal_label(terminal)));
        }
    }

    #[test]
    fn drive_run_with_health_reports_every_processed_seed_once() {
        let id = RunId(21);
        let signal = CancelSignal::new(id);
        let mut progress = RecordingProgress::default();

        let outcome = drive_run_with_health(id, 4, &signal, None, |_i| Ok(()), &mut progress);

        assert_eq!(
            outcome,
            RunTerminalState::Completed {
                summary: RunSummary {
                    seeds_processed: 4,
                    cancelled_at_seed: None,
                },
            }
        );
        assert_eq!(progress.processed, vec![(0, 1), (1, 2), (2, 3), (3, 4)]);
        assert!(progress.failures.is_empty());
        assert_eq!(progress.finished, vec![(4, "completed")]);
    }

    #[test]
    fn drive_run_with_health_reports_failure_before_finishing() {
        let id = RunId(22);
        let signal = CancelSignal::new(id);
        let mut progress = RecordingProgress::default();

        let outcome = drive_run_with_health(
            id,
            10,
            &signal,
            None,
            |i| {
                if i == 2 {
                    return Err("auth: missing authorization entry".to_string());
                }
                Ok(())
            },
            &mut progress,
        );

        assert_eq!(
            outcome,
            RunTerminalState::Failed {
                message: "auth: missing authorization entry".to_string(),
            }
        );
        assert_eq!(progress.processed, vec![(0, 1), (1, 2)]);
        assert_eq!(
            progress.failures,
            vec![(2, "auth: missing authorization entry".to_string())]
        );
        assert_eq!(progress.finished, vec![(2, "failed")]);
    }

    #[test]
    fn drive_run_with_health_counts_only_owned_seeds_for_partition() {
        let id = RunId(23);
        let signal = CancelSignal::new(id);
        let partition = WorkerPartition::try_new(1, 3).expect("partition");
        let mut progress = RecordingProgress::default();

        drive_run_with_health(id, 6, &signal, Some(partition), |_i| Ok(()), &mut progress);

        // 0..6 with worker 1 of 3 owns 1 and 4; the count is per-worker, not global.
        assert_eq!(progress.processed, vec![(1, 1), (4, 2)]);
        assert_eq!(progress.finished, vec![(2, "completed")]);
    }

    #[test]
    fn drive_run_with_health_reports_cancellation_as_finished() {
        let base = unique_tmp();
        let id = RunId(24);
        let signal = CancelSignal::with_state_dir(id, &base);
        let mut progress = RecordingProgress::default();

        let outcome = drive_run_with_health(
            id,
            10,
            &signal,
            None,
            |i| {
                if i == 2 {
                    signal.cancel();
                }
                Ok(())
            },
            &mut progress,
        );

        match outcome {
            RunTerminalState::Cancelled { summary } => {
                assert_eq!(summary.cancelled_at_seed, Some(3));
            }
            other => panic!("expected cancelled, got {other:?}"),
        }
        assert_eq!(progress.processed, vec![(0, 1), (1, 2), (2, 3)]);
        assert!(progress.failures.is_empty());
        assert_eq!(progress.finished, vec![(3, "cancelled")]);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn drive_run_from_checkpoint_with_health_reports_resumed_seeds() {
        let id = RunId(25);
        let signal = CancelSignal::new(id);
        let seeds = seeds(5);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        checkpoint.advance_by(3);
        let mut progress = RecordingProgress::default();

        let outcome = drive_run_from_checkpoint_with_health(
            id,
            "campaign-1",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |_i| Ok(()),
            &mut progress,
        )
        .expect("resume succeeds");

        assert!(matches!(outcome, RunTerminalState::Completed { .. }));
        // Reported counts are per-resume (1..2), while the indices stay global.
        assert_eq!(progress.processed, vec![(3, 1), (4, 2)]);
        assert_eq!(progress.finished, vec![(2, "completed")]);
    }

    #[test]
    fn drive_run_partitioned_from_checkpoint_with_health_reports_global_indices() {
        let id = RunId(26);
        let signal = CancelSignal::new(id);
        let seeds = seeds(8);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        checkpoint.advance_by(2);
        let partition = WorkerPartition::try_new(1, 3).expect("partition");
        let mut progress = RecordingProgress::default();

        drive_run_partitioned_from_checkpoint_with_health(
            id,
            "campaign-1",
            &mut checkpoint,
            seeds.len() as u64,
            &partition,
            &signal,
            |_i| Ok(()),
            &mut progress,
        )
        .expect("resume succeeds");

        assert_eq!(progress.processed, vec![(4, 1), (7, 2)]);
        assert_eq!(checkpoint.next_seed_index, seeds.len());
        assert_eq!(progress.finished, vec![(2, "completed")]);
    }

    #[test]
    fn rejected_resume_reports_nothing() {
        let id = RunId(27);
        let signal = CancelSignal::new(id);
        let seeds = seeds(3);
        let mut checkpoint = RunCheckpoint::new_run("campaign-1", &seeds);
        let mut progress = RecordingProgress::default();

        drive_run_from_checkpoint_with_health(
            id,
            "campaign-other",
            &mut checkpoint,
            seeds.len() as u64,
            &signal,
            |_i| Ok(()),
            &mut progress,
        )
        .expect_err("campaign mismatch should fail");

        assert!(progress.processed.is_empty());
        assert!(progress.failures.is_empty());
        assert!(progress.finished.is_empty());
    }
}
