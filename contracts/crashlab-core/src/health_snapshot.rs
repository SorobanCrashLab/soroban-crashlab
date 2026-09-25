//! Versioned campaign health snapshots (#1593).
//!
//! [`HealthMonitor`] computes throughput, failure and queue metrics, but nothing
//! consumed it: a long campaign ran blind between its start and its final
//! summary, and the web dashboard's live run stream had no real producer.
//!
//! This module is the missing producer. [`CampaignHealth`] implements
//! [`RunProgress`], so a `drive_run*` loop feeds it every seed and failure, and
//! it writes a **snapshot per interval** as one JSON object per line to
//! `<state-dir>/runs/<id>/health.jsonl`. `crashlab runs status <id>` reads the
//! last line back, and the web SSE route can tail the same file instead of
//! synthesizing events.
//!
//! The line format is versioned: every snapshot carries `schema_version`, and
//! readers reject anything outside [`SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS`] rather
//! than guessing. See `docs/health-snapshot-schema.md`.

use crate::health::{FailureMetrics, HealthMonitor, HealthStatus, QueueMetrics, ThroughputMetrics};
use crate::run_control::{RunId, RunProgress, RunTerminalState};
use crate::taxonomy::FailureClass;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Version of the snapshot line format written by this crate.
pub const HEALTH_SNAPSHOT_SCHEMA_VERSION: u32 = 1;

/// Schema versions [`HealthSnapshot::from_json_line`] accepts.
pub const SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS: &[u32] = &[HEALTH_SNAPSHOT_SCHEMA_VERSION];

/// File name of the append-only snapshot log inside a run's state directory.
pub const HEALTH_SNAPSHOT_FILE: &str = "health.jsonl";

/// Snapshots are written at most once per this many processed seeds unless the
/// caller overrides the interval.
pub const DEFAULT_SNAPSHOT_INTERVAL_SEEDS: u64 = 100;

/// How much campaign is left, in seeds.
///
/// `remaining_seeds` is the authoritative "budget remaining" for a run: the
/// total the campaign was asked for minus the seeds this worker finished.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetSnapshot {
    pub total_seeds: u64,
    pub processed_seeds: u64,
    pub remaining_seeds: u64,
}

impl BudgetSnapshot {
    pub fn new(total_seeds: u64, processed_seeds: u64) -> Self {
        Self {
            total_seeds,
            processed_seeds,
            remaining_seeds: total_seeds.saturating_sub(processed_seeds),
        }
    }
}

/// One point in a campaign's timeline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HealthSnapshot {
    /// Format version of this line; see [`HEALTH_SNAPSHOT_SCHEMA_VERSION`].
    pub schema_version: u32,
    pub run_id: u64,
    /// Campaign the run belongs to, when the caller knows it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub campaign_id: Option<String>,
    /// 1-based order of this snapshot within the run's log.
    pub sequence: u64,
    /// RFC 3339 UTC timestamp of this snapshot.
    pub emitted_at: String,
    /// Set only on the final snapshot, to the terminal state of the loop.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal: Option<String>,
    pub status: HealthStatus,
    pub throughput: ThroughputMetrics,
    pub failures: FailureMetrics,
    /// Failures per [`FailureClass`] label, so a stall can be attributed.
    #[serde(default)]
    pub failure_classes: BTreeMap<String, u64>,
    pub queue: QueueMetrics,
    pub budget: BudgetSnapshot,
}

impl HealthSnapshot {
    /// Builds a snapshot from the monitor's current metrics.
    pub fn from_monitor(
        monitor: &HealthMonitor,
        run_id: RunId,
        sequence: u64,
        total_seeds: u64,
        seeds_processed: u64,
        emitted_at: impl Into<String>,
    ) -> Self {
        let summary = monitor.summary();
        Self {
            schema_version: HEALTH_SNAPSHOT_SCHEMA_VERSION,
            run_id: run_id.0,
            campaign_id: None,
            sequence,
            emitted_at: emitted_at.into(),
            terminal: None,
            status: summary.status,
            throughput: summary.throughput,
            failures: summary.failures,
            failure_classes: summary.failure_classes,
            queue: summary.queue,
            budget: BudgetSnapshot::new(total_seeds, seeds_processed),
        }
    }

    /// Attaches the campaign id.
    pub fn with_campaign_id(mut self, campaign_id: impl Into<String>) -> Self {
        self.campaign_id = Some(campaign_id.into());
        self
    }

    /// Marks this as the final snapshot, recording how the loop ended.
    pub fn with_terminal(mut self, terminal: impl Into<String>) -> Self {
        self.terminal = Some(terminal.into());
        self
    }

    /// Serializes to one JSON line, newline included.
    ///
    /// The log is JSON Lines, so the object must never be pretty-printed: one
    /// snapshot has to occupy exactly one line.
    pub fn to_json_line(&self) -> Result<String, serde_json::Error> {
        let mut line = serde_json::to_string(self)?;
        line.push('\n');
        Ok(line)
    }

    /// Parses one log line, rejecting schema versions this build cannot read.
    pub fn from_json_line(line: &str) -> Result<Self, HealthSnapshotError> {
        let snapshot: HealthSnapshot = serde_json::from_str(line)?;
        if !SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS.contains(&snapshot.schema_version) {
            return Err(HealthSnapshotError::UnsupportedSchema {
                found: snapshot.schema_version,
                supported: SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS,
            });
        }
        Ok(snapshot)
    }
}

/// Snapshot read/write failures.
#[derive(Debug)]
pub enum HealthSnapshotError {
    Io(io::Error),
    Json(serde_json::Error),
    UnsupportedSchema {
        found: u32,
        supported: &'static [u32],
    },
}

impl std::fmt::Display for HealthSnapshotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthSnapshotError::Io(err) => write!(f, "health snapshot I/O error: {err}"),
            HealthSnapshotError::Json(err) => write!(f, "health snapshot is not valid JSON: {err}"),
            HealthSnapshotError::UnsupportedSchema { found, supported } => write!(
                f,
                "health snapshot schema version {found} is not supported (this build reads {supported:?})"
            ),
        }
    }
}

impl std::error::Error for HealthSnapshotError {}

impl From<io::Error> for HealthSnapshotError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for HealthSnapshotError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

/// Path of `run_id`'s snapshot log under `base`.
pub fn health_snapshot_path(run_id: RunId, base: impl AsRef<Path>) -> PathBuf {
    base.as_ref()
        .join("runs")
        .join(run_id.0.to_string())
        .join(HEALTH_SNAPSHOT_FILE)
}

/// Appends one snapshot line, creating the run directory when needed.
///
/// Appends are single `write_all` calls of a complete line, so a reader tailing
/// the file never observes a half-written snapshot unless the process died
/// mid-write — which is why [`read_latest_health_snapshot`] tolerates a corrupt
/// final line.
pub fn append_health_snapshot(
    run_id: RunId,
    base: impl AsRef<Path>,
    snapshot: &HealthSnapshot,
) -> Result<PathBuf, HealthSnapshotError> {
    use std::io::Write as _;

    let path = health_snapshot_path(run_id, base);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let line = snapshot.to_json_line()?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    file.write_all(line.as_bytes())?;

    Ok(path)
}

/// Reads every snapshot in `run_id`'s log, oldest first.
///
/// Fails on the first unreadable line: a caller that needs the whole history
/// should hear about corruption rather than get a silently short list. Use
/// [`read_latest_health_snapshot`] when only the newest snapshot matters.
pub fn read_health_snapshots(
    run_id: RunId,
    base: impl AsRef<Path>,
) -> Result<Vec<HealthSnapshot>, HealthSnapshotError> {
    let path = health_snapshot_path(run_id, base);
    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.into()),
    };

    let mut snapshots = Vec::new();
    for line in contents.lines().filter(|line| !line.trim().is_empty()) {
        snapshots.push(HealthSnapshot::from_json_line(line)?);
    }

    Ok(snapshots)
}

/// Reads the newest snapshot in `run_id`'s log, or `None` when there is none.
///
/// Corrupt or unsupported lines are skipped rather than returned as errors: a
/// campaign that was killed mid-write should still report its last good
/// snapshot, and an old schema should read as "no snapshot" for a reader that
/// cannot understand it.
pub fn read_latest_health_snapshot(
    run_id: RunId,
    base: impl AsRef<Path>,
) -> Result<Option<HealthSnapshot>, HealthSnapshotError> {
    let path = health_snapshot_path(run_id, base);
    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };

    for line in contents
        .lines()
        .rev()
        .filter(|line| !line.trim().is_empty())
    {
        if let Ok(snapshot) = HealthSnapshot::from_json_line(line) {
            return Ok(Some(snapshot));
        }
    }

    Ok(None)
}

/// Best-effort failure class for a drive loop's error message.
///
/// A `drive_run*` `work` callback returns free-form text, so the class is only
/// taken when the message actually carries a stable label: either the whole
/// message (`"auth"`) or a `label: detail` prefix (`"auth: missing entry"`).
/// Anything else is [`FailureClass::Unknown`] — a guess would be worse than an
/// honest bucket.
pub fn classify_failure_message(message: &str) -> FailureClass {
    let trimmed = message.trim();
    if let Some(class) = FailureClass::from_category_label(trimmed) {
        return class;
    }
    if let Some((label, _detail)) = trimmed.split_once(':') {
        if let Some(class) = FailureClass::from_category_label(label.trim()) {
            return class;
        }
    }
    FailureClass::Unknown
}

/// Turns drive-loop callbacks into periodic, persisted health snapshots.
///
/// Wire it in by calling a `drive_run*_with_health` function with this as the
/// [`RunProgress`]:
///
/// ```rust,no_run
/// use crashlab_core::health_snapshot::CampaignHealth;
/// use crashlab_core::{drive_run_with_health, CancelSignal, RunId};
///
/// let run_id = RunId(42);
/// let signal = CancelSignal::new(run_id);
/// let mut health = CampaignHealth::new(run_id, 10_000)
///     .with_campaign_id("campaign-7")
///     .with_state_dir("/var/lib/crashlab")
///     .emitting_every(500);
///
/// let outcome = drive_run_with_health(run_id, 10_000, &signal, None, |_seed| Ok(()), &mut health);
/// # let _ = outcome;
/// ```
///
/// Snapshots are written best-effort, matching how the cancel marker is written:
/// a campaign must not fail because a status file could not be appended. Write
/// failures are counted in [`CampaignHealth::snapshot_write_failures`] so they
/// are observable instead of silent.
#[derive(Debug)]
pub struct CampaignHealth {
    run_id: RunId,
    campaign_id: Option<String>,
    total_seeds: u64,
    emit_every_seeds: u64,
    state_dir: Option<PathBuf>,
    monitor: HealthMonitor,
    sequence: u64,
    snapshots_emitted: u64,
    snapshot_write_failures: u64,
    terminal: Option<String>,
    last: Option<HealthSnapshot>,
}

impl CampaignHealth {
    /// Creates a reporter for `run_id`, which is expected to run `total_seeds`.
    ///
    /// Without [`CampaignHealth::with_state_dir`] snapshots are still produced
    /// (and readable via [`CampaignHealth::last_snapshot`]) but not persisted.
    pub fn new(run_id: RunId, total_seeds: u64) -> Self {
        Self {
            run_id,
            campaign_id: None,
            total_seeds,
            emit_every_seeds: DEFAULT_SNAPSHOT_INTERVAL_SEEDS,
            state_dir: None,
            // A campaign's queue holds at most one pending seed per slot, so the
            // requested seed count is the natural capacity for utilization.
            monitor: HealthMonitor::new(total_seeds.max(1)),
            sequence: 0,
            snapshots_emitted: 0,
            snapshot_write_failures: 0,
            terminal: None,
            last: None,
        }
    }

    pub fn with_campaign_id(mut self, campaign_id: impl Into<String>) -> Self {
        self.campaign_id = Some(campaign_id.into());
        self
    }

    /// Persists snapshots to `<base>/runs/<id>/health.jsonl`.
    pub fn with_state_dir(mut self, base: impl AsRef<Path>) -> Self {
        self.state_dir = Some(base.as_ref().to_path_buf());
        self
    }

    /// Overrides the queue capacity used for utilization metrics.
    pub fn with_queue_capacity(mut self, capacity: u64) -> Self {
        self.monitor = HealthMonitor::new(capacity);
        self
    }

    /// Emits a snapshot every `seeds` processed seeds. A value of `0` emits on
    /// every seed.
    pub fn emitting_every(mut self, seeds: u64) -> Self {
        self.emit_every_seeds = seeds;
        self
    }

    /// Reports the queue depth, when the caller tracks in-flight work.
    pub fn update_queue(&mut self, pending: u64, in_progress: u64) {
        self.monitor.update_queue(pending, in_progress);
    }

    pub fn monitor(&self) -> &HealthMonitor {
        &self.monitor
    }

    pub fn run_id(&self) -> RunId {
        self.run_id
    }

    /// The most recent snapshot, if any was emitted.
    pub fn last_snapshot(&self) -> Option<&HealthSnapshot> {
        self.last.as_ref()
    }

    /// How many snapshots have been produced.
    pub fn snapshots_emitted(&self) -> u64 {
        self.snapshots_emitted
    }

    /// How many snapshots could not be appended to the status file.
    ///
    /// Non-zero means the campaign ran but its status log is incomplete; it does
    /// not fail the run.
    pub fn snapshot_write_failures(&self) -> u64 {
        self.snapshot_write_failures
    }

    /// Records a failure under a stable class label.
    pub fn record_failure(&mut self, class: &str, is_new_signature: bool) {
        self.monitor
            .record_classified_failure(class, is_new_signature);
    }

    /// Emits a snapshot for the current metrics, persisting it when configured.
    ///
    /// Called by [`CampaignHealth::on_seed_processed`] at each interval and once
    /// more by [`CampaignHealth::on_finish`].
    pub fn emit_snapshot(&mut self, seeds_processed: u64) -> &HealthSnapshot {
        self.sequence += 1;

        let mut snapshot = HealthSnapshot::from_monitor(
            &self.monitor,
            self.run_id,
            self.sequence,
            self.total_seeds,
            seeds_processed,
            chrono::Utc::now().to_rfc3339(),
        );
        if let Some(campaign_id) = &self.campaign_id {
            snapshot = snapshot.with_campaign_id(campaign_id.clone());
        }
        if let Some(terminal) = &self.terminal {
            snapshot = snapshot.with_terminal(terminal.clone());
        }

        self.last = Some(snapshot);
        self.snapshots_emitted += 1;

        if let Some(base) = &self.state_dir {
            let snapshot = self.last.as_ref().expect("snapshot was just stored");
            if append_health_snapshot(self.run_id, base, snapshot).is_err() {
                self.snapshot_write_failures += 1;
            }
        }

        self.last.as_ref().expect("snapshot was just stored")
    }
}

impl RunProgress for CampaignHealth {
    fn on_seed_processed(&mut self, _seed_index: u64, seeds_processed: u64) {
        self.monitor.record_case();

        let interval = self.emit_every_seeds.max(1);
        if seeds_processed % interval == 0 {
            self.emit_snapshot(seeds_processed);
        }
    }

    fn on_failure(&mut self, _seed_index: u64, message: &str) {
        let class = classify_failure_message(message);
        // A class counts as a new signature the first time it is seen; the loop
        // reports messages, not signatures.
        let is_new = !self.monitor.failure_classes().contains_key(class.as_str());
        self.record_failure(class.as_str(), is_new);
    }

    fn on_finish(&mut self, seeds_processed: u64, terminal: &RunTerminalState) {
        self.terminal = Some(terminal_label(terminal).to_string());
        self.emit_snapshot(seeds_processed);
    }
}

/// Stable label for a terminal state, as written to snapshots.
pub fn terminal_label(terminal: &RunTerminalState) -> &'static str {
    match terminal {
        RunTerminalState::Completed { .. } => "completed",
        RunTerminalState::Cancelled { .. } => "cancelled",
        RunTerminalState::Failed { .. } => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::HealthStatus;
    use crate::run_control::{drive_run_with_health, CancelSignal};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let seq = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("crashlab-health-{n}-{seq}"))
    }

    fn monitor_with_cases(cases: u64) -> HealthMonitor {
        let mut monitor = HealthMonitor::new(100);
        for _ in 0..cases {
            monitor.record_case();
        }
        monitor
    }

    // ── snapshot shape ───────────────────────────────────────────────────────

    #[test]
    fn snapshot_serializes_to_a_single_line() {
        let snapshot = HealthSnapshot::from_monitor(
            &monitor_with_cases(10),
            RunId(1),
            1,
            100,
            10,
            "2026-09-25T00:00:00Z",
        );

        let line = snapshot.to_json_line().expect("serialize");
        assert!(line.ends_with('\n'), "line must be newline terminated");
        assert_eq!(
            line.trim_end_matches('\n').lines().count(),
            1,
            "a snapshot must never span lines: {line}"
        );
        assert_eq!(line.matches('\n').count(), 1);
    }

    #[test]
    fn snapshot_round_trips_through_a_json_line() {
        let mut monitor = monitor_with_cases(4);
        monitor.record_classified_failure("auth", true);
        monitor.update_queue(3, 1);

        let snapshot = HealthSnapshot::from_monitor(&monitor, RunId(9), 2, 50, 4, "t")
            .with_campaign_id("campaign-1")
            .with_terminal("completed");

        let line = snapshot.to_json_line().expect("serialize");
        let parsed = HealthSnapshot::from_json_line(&line).expect("parse");

        assert_eq!(parsed, snapshot);
        assert_eq!(parsed.schema_version, HEALTH_SNAPSHOT_SCHEMA_VERSION);
        assert_eq!(parsed.run_id, 9);
        assert_eq!(parsed.campaign_id.as_deref(), Some("campaign-1"));
        assert_eq!(parsed.terminal.as_deref(), Some("completed"));
        assert_eq!(parsed.failure_classes.get("auth"), Some(&1));
        assert_eq!(parsed.queue.pending, 3);
    }

    #[test]
    fn snapshot_records_budget_remaining() {
        let snapshot =
            HealthSnapshot::from_monitor(&monitor_with_cases(30), RunId(2), 3, 100, 30, "t");

        assert_eq!(snapshot.budget.total_seeds, 100);
        assert_eq!(snapshot.budget.processed_seeds, 30);
        assert_eq!(snapshot.budget.remaining_seeds, 70);
    }

    #[test]
    fn budget_remaining_never_underflows() {
        let budget = BudgetSnapshot::new(10, 11);
        assert_eq!(budget.remaining_seeds, 0);
    }

    #[test]
    fn unsupported_schema_versions_are_rejected() {
        let snapshot = HealthSnapshot::from_monitor(&monitor_with_cases(1), RunId(1), 1, 1, 1, "t");
        let line = snapshot.to_json_line().expect("serialize");
        let bumped = line.replace("\"schema_version\":1", "\"schema_version\":99");

        match HealthSnapshot::from_json_line(&bumped) {
            Err(HealthSnapshotError::UnsupportedSchema { found, supported }) => {
                assert_eq!(found, 99);
                assert_eq!(supported, SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS);
            }
            other => panic!("expected UnsupportedSchema, got {other:?}"),
        }
    }

    #[test]
    fn malformed_lines_report_a_json_error() {
        let err = HealthSnapshot::from_json_line("{ not json").expect_err("should fail");
        assert!(matches!(err, HealthSnapshotError::Json(_)));
        assert!(err.to_string().contains("not valid JSON"));
    }

    // ── status file ──────────────────────────────────────────────────────────

    #[test]
    fn append_and_read_latest_snapshot() {
        let base = unique_tmp();
        let run_id = RunId(11);

        for sequence in 1..=3u64 {
            let snapshot = HealthSnapshot::from_monitor(
                &monitor_with_cases(sequence),
                run_id,
                sequence,
                10,
                sequence,
                "t",
            );
            append_health_snapshot(run_id, &base, &snapshot).expect("append");
        }

        let all = read_health_snapshots(run_id, &base).expect("read");
        assert_eq!(all.len(), 3);
        assert_eq!(
            all.iter().map(|s| s.sequence).collect::<Vec<_>>(),
            vec![1, 2, 3]
        );

        let latest = read_latest_health_snapshot(run_id, &base)
            .expect("read")
            .expect("some");
        assert_eq!(latest.sequence, 3);
        assert_eq!(latest.budget.processed_seeds, 3);

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn snapshot_path_is_per_run() {
        let base = PathBuf::from("/tmp/crashlab-state");
        assert_eq!(
            health_snapshot_path(RunId(7), &base),
            base.join("runs").join("7").join(HEALTH_SNAPSHOT_FILE)
        );
    }

    #[test]
    fn missing_snapshot_file_is_not_an_error() {
        let base = unique_tmp();
        assert!(read_latest_health_snapshot(RunId(1), &base)
            .expect("read")
            .is_none());
        assert!(read_health_snapshots(RunId(1), &base)
            .expect("read")
            .is_empty());
    }

    #[test]
    fn latest_snapshot_skips_a_truncated_final_line() {
        let base = unique_tmp();
        let run_id = RunId(12);
        let snapshot = HealthSnapshot::from_monitor(&monitor_with_cases(1), run_id, 1, 5, 1, "t");
        let path = append_health_snapshot(run_id, &base, &snapshot).expect("append");

        // Simulate a campaign killed mid-write: a partial second line.
        let mut contents = fs::read_to_string(&path).expect("read");
        contents.push_str("{\"schema_version\":1,\"run_id\":12,\"sequ");
        fs::write(&path, contents).expect("write");

        let latest = read_latest_health_snapshot(run_id, &base)
            .expect("read")
            .expect("last good snapshot");
        assert_eq!(latest.sequence, 1);

        // Reading the whole log, by contrast, reports the corruption.
        assert!(read_health_snapshots(run_id, &base).is_err());

        let _ = fs::remove_dir_all(&base);
    }

    // ── failure classification ───────────────────────────────────────────────

    #[test]
    fn classifies_bare_and_prefixed_failure_messages() {
        assert_eq!(classify_failure_message("auth"), FailureClass::Auth);
        assert_eq!(
            classify_failure_message("auth: missing authorization entry"),
            FailureClass::Auth
        );
        assert_eq!(
            classify_failure_message("  timeout: attempt exceeded  "),
            FailureClass::Timeout
        );
        assert_eq!(
            classify_failure_message("invalid-enum-tag: tag 0xE0"),
            FailureClass::InvalidEnumTag
        );
    }

    #[test]
    fn unlabelled_messages_fall_back_to_unknown() {
        assert_eq!(
            classify_failure_message("seed 3 failed"),
            FailureClass::Unknown
        );
        assert_eq!(classify_failure_message(""), FailureClass::Unknown);
        assert_eq!(
            classify_failure_message("statement rejected"),
            FailureClass::Unknown,
            "a label must match a whole token, not a prefix of a word"
        );
    }

    // ── CampaignHealth ───────────────────────────────────────────────────────

    #[test]
    fn emits_one_snapshot_per_interval() {
        let mut health = CampaignHealth::new(RunId(21), 10).emitting_every(3);
        let signal = CancelSignal::new(RunId(21));

        drive_run_with_health(RunId(21), 10, &signal, None, |_seed| Ok(()), &mut health);

        // Emissions at 3, 6, 9 plus the final one.
        assert_eq!(health.snapshots_emitted(), 4);
        let last = health.last_snapshot().expect("final snapshot");
        assert_eq!(last.sequence, 4);
        assert_eq!(last.budget.processed_seeds, 10);
        assert_eq!(last.budget.remaining_seeds, 0);
        assert_eq!(last.terminal.as_deref(), Some("completed"));
        assert_eq!(last.throughput.total_cases, 10);
    }

    #[test]
    fn emitting_every_zero_emits_on_every_seed() {
        let mut health = CampaignHealth::new(RunId(22), 3).emitting_every(0);
        let signal = CancelSignal::new(RunId(22));

        drive_run_with_health(RunId(22), 3, &signal, None, |_seed| Ok(()), &mut health);

        // One snapshot per seed, plus the final one.
        assert_eq!(health.snapshots_emitted(), 4);
    }

    #[test]
    fn final_snapshot_records_the_terminal_state() {
        let mut health = CampaignHealth::new(RunId(23), 5).emitting_every(100);
        let signal = CancelSignal::new(RunId(23));

        drive_run_with_health(
            RunId(23),
            5,
            &signal,
            None,
            |seed| {
                if seed == 1 {
                    return Err("state: ledger entry missing".to_string());
                }
                Ok(())
            },
            &mut health,
        );

        let last = health.last_snapshot().expect("final snapshot");
        assert_eq!(last.terminal.as_deref(), Some("failed"));
        assert_eq!(last.budget.processed_seeds, 1);
        assert_eq!(last.failures.total_failures, 1);
        assert_eq!(last.failure_classes.get("state"), Some(&1));
        assert_eq!(
            last.status,
            HealthStatus::Unhealthy,
            "the run stopped after 1 seed and that seed failed: a 1.0 failure rate is above the default 0.5 threshold"
        );
    }

    #[test]
    fn counts_failures_per_class_and_treats_the_first_as_new() {
        let mut health = CampaignHealth::new(RunId(24), 10).emitting_every(100);

        health.on_failure(0, "auth: missing entry");
        health.on_failure(1, "auth: missing entry");
        health.on_failure(2, "timeout: exceeded");
        health.on_failure(3, "something else entirely");

        let monitor = health.monitor();
        assert_eq!(monitor.failure_classes().get("auth"), Some(&2));
        assert_eq!(monitor.failure_classes().get("timeout"), Some(&1));
        assert_eq!(monitor.failure_classes().get("unknown"), Some(&1));

        let snapshot = health.emit_snapshot(4);
        assert_eq!(snapshot.failures.total_failures, 4);
        assert_eq!(
            snapshot.failures.unique_signatures, 3,
            "one per distinct class"
        );
    }

    #[test]
    fn persisted_snapshots_are_readable_by_the_status_reader() {
        let base = unique_tmp();
        let run_id = RunId(25);
        let mut health = CampaignHealth::new(run_id, 4)
            .with_campaign_id("campaign-4")
            .with_state_dir(&base)
            .emitting_every(2);
        let signal = CancelSignal::new(run_id);

        drive_run_with_health(run_id, 4, &signal, None, |_seed| Ok(()), &mut health);

        assert_eq!(
            health.snapshot_write_failures(),
            0,
            "status log is writable"
        );

        let all = read_health_snapshots(run_id, &base).expect("read");
        assert_eq!(all.len(), 3, "2, 4 and the final snapshot");
        assert_eq!(all[0].campaign_id.as_deref(), Some("campaign-4"));
        assert!(all[0].terminal.is_none(), "only the last snapshot is final");

        let latest = read_latest_health_snapshot(run_id, &base)
            .expect("read")
            .expect("some");
        assert_eq!(latest.sequence, 3);
        assert_eq!(latest.terminal.as_deref(), Some("completed"));
        assert_eq!(latest.budget.remaining_seeds, 0);

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn queue_metrics_can_be_reported() {
        let mut health = CampaignHealth::new(RunId(26), 100)
            .with_queue_capacity(10)
            .emitting_every(1);
        health.update_queue(4, 1);

        let snapshot = health.emit_snapshot(0);
        assert_eq!(snapshot.queue.pending, 4);
        assert_eq!(snapshot.queue.in_progress, 1);
        assert!((snapshot.queue.utilization - 0.5).abs() < 0.001);
    }

    #[test]
    fn unwritable_state_dir_is_counted_not_fatal() {
        // A regular file where the run directory should be makes create_dir_all fail.
        let base = unique_tmp();
        fs::create_dir_all(&base).expect("create base");
        fs::write(base.join("runs"), b"not a directory").expect("write blocker");

        let run_id = RunId(27);
        let mut health = CampaignHealth::new(run_id, 1)
            .with_state_dir(&base)
            .emitting_every(1);
        let signal = CancelSignal::new(run_id);

        let outcome = drive_run_with_health(run_id, 1, &signal, None, |_seed| Ok(()), &mut health);

        assert_eq!(
            outcome,
            RunTerminalState::Completed {
                summary: crate::run_control::RunSummary {
                    seeds_processed: 1,
                    cancelled_at_seed: None,
                },
            },
            "an unwritable status log must not fail the campaign"
        );
        assert!(health.snapshot_write_failures() >= 1);
        assert!(
            health.last_snapshot().is_some(),
            "the snapshot is still produced in memory"
        );

        let _ = fs::remove_dir_all(&base);
    }
}
