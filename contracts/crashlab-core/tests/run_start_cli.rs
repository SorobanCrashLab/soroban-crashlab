//! `crashlab run start` integration tests (issue #1576).
//!
//! Exercises the real binary through `CARGO_BIN_EXE_crashlab` against the mock
//! runner (`CRASHLAB_RUNNER` unset), so every campaign here is short,
//! deterministic, and needs no network or live Soroban host.
//!
//! Covered: campaign start, checkpoint persistence, resume (including the
//! already-complete case), campaign-mismatch rejection, cancel markers, worker
//! partitioning, and option validation.

use crashlab_core::{
    RUN_CHECKPOINT_SCHEMA_VERSION, RunCheckpoint, RunId, cancel_marker_path,
    load_run_checkpoint_json,
};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_tmp(tag: &str) -> PathBuf {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir().join(format!("crashlab-run-start-{tag}-{n}"))
}

fn crashlab(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .args(args)
        .output()
        .expect("run crashlab binary")
}

fn stdout_of(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).to_string()
}

fn stderr_of(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).to_string()
}

fn read_checkpoint(base: &PathBuf, run_id: u64) -> RunCheckpoint {
    let path = base.join("runs").join(run_id.to_string()).join("checkpoint.json");
    let bytes = fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    load_run_checkpoint_json(&bytes).expect("parse checkpoint")
}

fn cleanup(base: &PathBuf) {
    let _ = fs::remove_dir_all(base);
}

#[test]
fn run_start_completes_and_persists_a_checkpoint() {
    let base = unique_tmp("complete");
    let out_dir = base.join("out");
    let run_id = 7u64;

    let out = crashlab(&[
        "run",
        "start",
        "--preset",
        "smoke",
        "--seeds",
        "8",
        "--budget",
        "8",
        "--output",
        out_dir.to_str().unwrap(),
        "--run-id",
        &run_id.to_string(),
        "--checkpoint-interval",
        "2",
        "--progress-interval",
        "4",
    ]);

    assert!(
        out.status.success(),
        "expected success, stderr: {}",
        stderr_of(&out)
    );
    let text = stdout_of(&out);
    assert!(text.contains("completed"), "missing completion line: {text}");
    assert!(
        text.contains("seeds_processed=8"),
        "expected 8 seeds processed: {text}"
    );
    // Progress must be emitted from the HealthMonitor summary.
    assert!(
        text.contains("progress:"),
        "expected progress lines: {text}"
    );
    assert!(
        text.contains("budget_remaining=0"),
        "expected the budget to be fully consumed: {text}"
    );

    let cp = read_checkpoint(&out_dir, run_id);
    assert_eq!(cp.campaign_id, "smoke-w0");
    assert_eq!(cp.total_seeds, 8);
    assert_eq!(
        cp.next_seed_index, 8,
        "a completed campaign should checkpoint past the last seed"
    );
    assert_eq!(cp.schema, RUN_CHECKPOINT_SCHEMA_VERSION);

    cleanup(&base);
}

#[test]
fn run_start_resume_skips_already_completed_seeds() {
    let base = unique_tmp("resume");
    let out_dir = base.join("out");
    let run_id = 11u64;
    let out_path = out_dir.to_str().unwrap().to_string();

    let first = crashlab(&[
        "run", "start", "--preset", "smoke", "--seeds", "6", "--budget", "6", "--output",
        &out_path, "--run-id", &run_id.to_string(), "--checkpoint-interval", "2",
    ]);
    assert!(first.status.success(), "stderr: {}", stderr_of(&first));
    assert_eq!(read_checkpoint(&out_dir, run_id).next_seed_index, 6);

    // Resuming a finished campaign must be a no-op, not a re-run.
    let second = crashlab(&[
        "run", "start", "--preset", "smoke", "--seeds", "6", "--budget", "6", "--output",
        &out_path, "--run-id", &run_id.to_string(), "--resume",
    ]);
    assert!(
        second.status.success(),
        "expected resume to succeed, stderr: {}",
        stderr_of(&second)
    );
    let text = stdout_of(&second);
    assert!(
        text.contains("seeds_processed=0"),
        "resume should process no seeds, got: {text}"
    );
    assert_eq!(read_checkpoint(&out_dir, run_id).next_seed_index, 6);

    cleanup(&base);
}

#[test]
fn run_start_resume_rejects_a_different_campaign() {
    let base = unique_tmp("mismatch");
    let out_dir = base.join("out");
    let run_id = 12u64;
    let out_path = out_dir.to_str().unwrap().to_string();

    let first = crashlab(&[
        "run", "start", "--preset", "smoke", "--seeds", "4", "--budget", "4", "--output",
        &out_path, "--run-id", &run_id.to_string(),
    ]);
    assert!(first.status.success(), "stderr: {}", stderr_of(&first));

    // Different preset => different campaign_id => refuse rather than silently
    // producing a checkpoint that does not describe this campaign.
    let second = crashlab(&[
        "run", "start", "--preset", "deep", "--seeds", "4", "--budget", "4", "--output",
        &out_path, "--run-id", &run_id.to_string(), "--resume",
    ]);
    assert!(
        !second.status.success(),
        "expected resume with a different preset to fail"
    );
    assert!(
        stderr_of(&second).contains("does not match"),
        "unexpected stderr: {}",
        stderr_of(&second)
    );

    // The original checkpoint must survive the rejected resume.
    assert_eq!(read_checkpoint(&out_dir, run_id).campaign_id, "smoke-w0");

    cleanup(&base);
}

#[test]
fn run_start_honors_a_preexisting_cancel_marker() {
    let base = unique_tmp("cancel");
    let out_dir = base.join("out");
    let run_id = 21u64;

    // Pre-create the marker so the driver observes cancellation immediately.
    let marker = cancel_marker_path(RunId(run_id), &out_dir);
    fs::create_dir_all(marker.parent().unwrap()).expect("create marker dir");
    fs::write(&marker, b"1").expect("write cancel marker");

    let out = crashlab(&[
        "run", "start", "--preset", "smoke", "--seeds", "32", "--budget", "32", "--output",
        out_dir.to_str().unwrap(), "--run-id", &run_id.to_string(),
    ]);

    assert!(
        out.status.success(),
        "a cancelled run is not a CLI failure, stderr: {}",
        stderr_of(&out)
    );
    let text = stdout_of(&out);
    assert!(text.contains("cancelled"), "expected cancel line: {text}");
    assert!(
        text.contains("seeds_processed=0"),
        "cancellation should be observed before the first seed: {text}"
    );
    // A cancelled campaign still checkpoints what it knows.
    let cp = read_checkpoint(&out_dir, run_id);
    assert_eq!(cp.next_seed_index, 0);

    cleanup(&base);
}

#[test]
fn run_start_partitions_seeds_across_workers() {
    let base = unique_tmp("partition");
    let out_dir = base.join("out");
    let out_path = out_dir.to_str().unwrap().to_string();

    // Two workers over 4 seeds: worker 0 owns 0 and 2, worker 1 owns 1 and 3.
    for (worker, expected) in [(0u32, 2u64), (1u32, 2u64)] {
        let out = crashlab(&[
            "run", "start", "--preset", "smoke", "--seeds", "4", "--budget", "8", "--workers",
            "2", "--worker", &worker.to_string(), "--output", &out_path, "--run-id",
            &worker.to_string(),
        ]);
        assert!(
            out.status.success(),
            "worker {worker} failed, stderr: {}",
            stderr_of(&out)
        );
        assert!(
            stdout_of(&out).contains(&format!("seeds_processed={expected}")),
            "worker {worker} should process {expected} seeds: {}",
            stdout_of(&out)
        );
    }

    // Each worker keeps its own checkpoint under its own run id.
    assert_eq!(read_checkpoint(&out_dir, 0).campaign_id, "smoke-w0");
    assert_eq!(read_checkpoint(&out_dir, 1).campaign_id, "smoke-w1");

    cleanup(&base);
}

#[test]
fn run_start_rejects_invalid_options() {
    let base = unique_tmp("invalid");
    let out_dir = base.join("out");
    let out_path = out_dir.to_str().unwrap().to_string();

    let cases: Vec<(&str, Vec<&str>, &str)> = vec![
        (
            "unknown flag",
            vec!["run", "start", "--nope", "1", "--output", &out_path],
            "unknown option",
        ),
        (
            "bad preset",
            vec!["run", "start", "--preset", "turbo", "--output", &out_path],
            "unknown campaign preset",
        ),
        (
            "worker index out of range",
            vec!["run", "start", "--workers", "2", "--worker", "5", "--output", &out_path],
            "worker",
        ),
        (
            "zero workers",
            vec!["run", "start", "--workers", "0", "--output", &out_path],
            "worker",
        ),
        (
            "non-numeric seeds",
            vec!["run", "start", "--seeds", "lots", "--output", &out_path],
            "invalid value for --seeds",
        ),
        (
            "missing flag value",
            vec!["run", "start", "--seeds"],
            "missing value for --seeds",
        ),
        (
            "zero checkpoint interval",
            vec![
                "run", "start", "--checkpoint-interval", "0", "--output", &out_path,
            ],
            "--checkpoint-interval",
        ),
    ];

    for (label, args, expect) in cases {
        let out = crashlab(&args);
        assert!(
            !out.status.success(),
            "{label}: expected a non-zero exit, stdout: {}",
            stdout_of(&out)
        );
        assert!(
            stderr_of(&out).contains(expect),
            "{label}: expected {expect:?} in stderr, got: {}",
            stderr_of(&out)
        );
    }

    cleanup(&base);
}

#[test]
fn run_start_resume_requires_an_existing_checkpoint() {
    let base = unique_tmp("nocheckpoint");
    let out_dir = base.join("out");

    let out = crashlab(&[
        "run",
        "start",
        "--preset",
        "smoke",
        "--seeds",
        "4",
        "--output",
        out_dir.to_str().unwrap(),
        "--resume",
    ]);

    assert!(
        !out.status.success(),
        "resume without a checkpoint should fail"
    );
    assert!(
        stderr_of(&out).contains("failed to read checkpoint"),
        "unexpected stderr: {}",
        stderr_of(&out)
    );

    cleanup(&base);
}
