//! End-to-end tests for `crashlab runs status <id>` (#1593).
//!
//! These drive the real binary against a real snapshot log written by
//! [`CampaignHealth`], so they cover the whole path a campaign operator uses:
//! the writer appends to `<state-dir>/runs/<id>/health.jsonl`, the reader picks
//! the newest line, and the CLI renders it as text or as the raw JSON line the
//! web dashboard consumes.

use crashlab_core::{
    append_health_snapshot, drive_run_with_health, health_snapshot_path, CampaignHealth,
    CancelSignal, HealthMonitor, HealthSnapshot, RunId,
};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_tmp() -> PathBuf {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let seq = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    std::env::temp_dir().join(format!("crashlab-runs-status-{pid}-{n}-{seq}"))
}

fn crashlab(base: &PathBuf, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", base)
        .args(args)
        .output()
        .expect("run crashlab binary")
}

/// Drives a campaign that persists snapshots, returning the state dir.
fn driven_campaign(run_id: u64, seeds: u64, emit_every: u64) -> PathBuf {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    let id = RunId(run_id);
    let signal = CancelSignal::with_state_dir(id, &base);
    let mut health = CampaignHealth::new(id, seeds)
        .with_campaign_id(format!("campaign-{run_id}"))
        .with_state_dir(&base)
        .emitting_every(emit_every);

    drive_run_with_health(id, seeds, &signal, None, |_seed| Ok(()), &mut health);
    assert_eq!(
        health.snapshot_write_failures(),
        0,
        "the campaign must be able to write its status log"
    );

    base
}

#[test]
fn runs_status_reports_a_run_without_snapshots() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    let output = crashlab(&base, &["runs", "status", "77"]);
    assert!(
        output.status.success(),
        "reading a missing run is not a failure"
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("no health snapshot for run 77"),
        "unexpected stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_json_reports_null_for_a_run_without_snapshots() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    let output = crashlab(&base, &["runs", "status", "77", "--json"]);
    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_eq!(stdout.trim(), "null", "unexpected stdout: {stdout}");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_summarizes_the_latest_snapshot() {
    let base = driven_campaign(41, 4, 2);

    let output = crashlab(&base, &["runs", "status", "41"]);
    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);

    for expected in [
        "run 41: healthy",
        "campaign: campaign-41",
        "terminal: completed",
        "seeds: 4/4 processed, 0 remaining",
        "no classified failures",
        "queue:",
    ] {
        assert!(
            stdout.contains(expected),
            "expected {expected:?} in stdout: {stdout}"
        );
    }

    // The summary describes the *final* snapshot, not the first one.
    assert!(
        stdout.contains("snapshot: #3"),
        "expected the final snapshot (3 of 3) to be reported: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_json_emits_the_last_log_line_verbatim() {
    let base = driven_campaign(42, 4, 2);

    let output = crashlab(&base, &["runs", "status", "42", "--json"]);
    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);

    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).expect("--json must emit one JSON object");
    assert_eq!(parsed["schema_version"], 1);
    assert_eq!(parsed["run_id"], 42);
    assert_eq!(parsed["campaign_id"], "campaign-42");
    assert_eq!(parsed["terminal"], "completed");
    assert_eq!(parsed["budget"]["processed_seeds"], 4);
    assert_eq!(parsed["budget"]["remaining_seeds"], 0);

    // Exactly what the campaign wrote: the dashboard tails this same file.
    let contents = fs::read_to_string(health_snapshot_path(RunId(42), &base)).expect("read log");
    let last_line = contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .next_back()
        .expect("at least one snapshot");
    assert_eq!(stdout.trim(), last_line.trim());

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_reports_classified_failures() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    // A campaign that sampled two seeds and hit two different failure classes.
    let mut monitor = HealthMonitor::new(8);
    monitor.record_case();
    monitor.record_case();
    monitor.record_classified_failure("auth", true);
    monitor.record_classified_failure("timeout", true);

    let snapshot = HealthSnapshot::from_monitor(
        &monitor,
        RunId(43),
        2,
        8,
        2,
        "2026-01-01T00:00:00+00:00".to_string(),
    )
    .with_campaign_id("campaign-43")
    .with_terminal("failed");
    append_health_snapshot(RunId(43), &base, &snapshot).expect("append snapshot");

    let output = crashlab(&base, &["runs", "status", "43"]);
    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(
        stdout.contains("run 43: unhealthy"),
        "two failures in two seeds is a 1.0 rate: {stdout}"
    );
    assert!(
        stdout.contains("failures: 2 total, 2 distinct class(es)"),
        "unexpected failures line: {stdout}"
    );
    assert!(stdout.contains("auth: 1"), "missing auth class: {stdout}");
    assert!(
        stdout.contains("timeout: 1"),
        "missing timeout class: {stdout}"
    );
    assert!(stdout.contains("terminal: failed"), "unexpected: {stdout}");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_ignores_a_half_written_trailing_line() {
    let base = driven_campaign(44, 2, 1);

    // Simulate a campaign killed mid-append: the last line never completed.
    let path = health_snapshot_path(RunId(44), &base);
    let mut contents = fs::read_to_string(&path).expect("read log");
    contents.push_str("{\"schema_version\":1,\"run_id\":44,\"sequence\":9,\"budget\":{\"tot");
    fs::write(&path, contents).expect("write log");

    let output = crashlab(&base, &["runs", "status", "44", "--json"]);
    assert!(
        output.status.success(),
        "a truncated tail must not hide the last good snapshot"
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).expect("last good snapshot is reported");
    assert_eq!(parsed["run_id"], 44);
    assert_eq!(
        parsed["sequence"], 3,
        "the truncated line must not be reported as a snapshot (1, 2 and the final snapshot are readable)"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_does_not_misread_an_unknown_schema_version() {
    let base = unique_tmp();
    let path = health_snapshot_path(RunId(45), &base);
    fs::create_dir_all(path.parent().expect("parent")).expect("create run dir");
    fs::write(
        &path,
        "{\"schema_version\":99,\"run_id\":45,\"sequence\":1,\"emitted_at\":\"2026-01-01T00:00:00+00:00\",\
         \"status\":\"healthy\",\"throughput\":{\"cases_per_second\":1.0,\"total_cases\":1,\"elapsed_secs\":1.0},\
         \"failures\":{\"total_failures\":0,\"unique_signatures\":0,\"failure_rate\":0.0},\
         \"failure_classes\":{},\"queue\":{\"pending\":0,\"in_progress\":0,\"capacity\":1,\"utilization\":0.0},\
         \"budget\":{\"total_seeds\":1,\"processed_seeds\":1,\"remaining_seeds\":0}}\n",
    )
    .expect("write log");

    let output = crashlab(&base, &["runs", "status", "45"]);
    assert!(
        output.status.success(),
        "an unsupported schema reads as 'no snapshot', not as a crash"
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("no health snapshot for run 45"),
        "a future schema must not be parsed as the current one: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_status_rejects_a_non_numeric_run_id() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    let output = crashlab(&base, &["runs", "status", "not-an-id"]);
    assert!(!output.status.success(), "a bad id must fail");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("invalid run id: not-an-id"),
        "unexpected stderr: {stderr}"
    );

    let _ = fs::remove_dir_all(&base);
}
