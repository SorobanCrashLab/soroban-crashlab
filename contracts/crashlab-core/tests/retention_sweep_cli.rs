use crashlab_core::bundle_persist::CaseBundleDocument;
use crashlab_core::{
    to_bundle, ArtifactStore, CaseSeed, LocalArtifactStore, RetentionPolicy, RunCheckpoint,
};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn unique_tmp() -> PathBuf {
    let count = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir().join(format!("crashlab-retention-sweep-{}-{}-{}", std::process::id(), n, count))
}

fn make_checkpoint(campaign_id: &str, next_seed_index: usize, total_seeds: usize) -> RunCheckpoint {
    let mut checkpoint = RunCheckpoint::new_run(campaign_id, &[]);
    checkpoint.next_seed_index = next_seed_index;
    checkpoint.total_seeds = total_seeds;
    checkpoint
}

fn write_checkpoint(dir: &PathBuf, run_id: u64, checkpoint: &RunCheckpoint) {
    let run_dir = dir.join("runs").join(run_id.to_string());
    fs::create_dir_all(&run_dir).expect("create run dir");
    let bytes = serde_json::to_vec_pretty(checkpoint).expect("serialize checkpoint");
    fs::write(run_dir.join("checkpoint.json"), bytes).expect("write checkpoint");
}

fn write_artifact(dir: &PathBuf, artifact_id: &str, seed_id: u64) {
    let artifact_dir = dir.join("artifacts");
    fs::create_dir_all(&artifact_dir).expect("create artifacts dir");
    let seed = CaseSeed {
        id: seed_id,
        payload: vec![seed_id as u8, 1, 2],
    };
    let bundle = to_bundle(seed.clone());
    let doc = CaseBundleDocument {
        schema: 1,
        seed,
        signature: bundle.signature.clone(),
        environment: None,
        failure_payload: vec![],
        rpc_envelope: None,
        provenance: None,
        original_seed: None,
        shrink_lineage: None,
    };
    let path = artifact_dir.join(format!("{artifact_id}.json"));
    let bytes = serde_json::to_vec(&doc).expect("serialize doc");
    fs::write(path, bytes).expect("write artifact");
}

fn run_sweep(base: &PathBuf, extra_args: &[&str]) -> std::process::Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_crashlab"));
    cmd.env("CRASHLAB_STATE_DIR", base)
        .args(["retention", "sweep"])
        .args(extra_args);
    cmd.output().expect("run crashlab binary")
}

#[test]
fn retention_sweep_prints_summary_on_empty_state_dir() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base");

    let output = run_sweep(&base, &[]);

    assert!(
        output.status.success(),
        "expected success on empty state dir, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("sweep summary"),
        "expected sweep summary line in stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_dry_run_makes_no_writes() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base");

    for i in 0..5u64 {
        write_artifact(&base, &format!("artifact-{i:04}"), i);
    }

    let artifact_dir = base.join("artifacts");
    let before: std::collections::BTreeSet<_> = fs::read_dir(&artifact_dir)
        .expect("read artifacts dir")
        .filter_map(|e| e.ok())
        .map(|e| e.file_name())
        .collect();

    let output = run_sweep(&base, &["--dry-run"]);

    assert!(
        output.status.success(),
        "expected success with --dry-run, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("sweep summary"),
        "expected sweep summary in stdout: {stdout}"
    );

    let after: std::collections::BTreeSet<_> = fs::read_dir(&artifact_dir)
        .expect("read artifacts dir")
        .filter_map(|e| e.ok())
        .map(|e| e.file_name())
        .collect();

    assert_eq!(before, after, "dry run must make zero writes");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_with_corrupt_object_reports_error() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base");

    let artifact_dir = base.join("artifacts");
    fs::create_dir_all(&artifact_dir).expect("create artifacts dir");
    let corrupt_path = artifact_dir.join("corrupt.json");
    fs::write(&corrupt_path, b"not valid json").expect("write corrupt artifact");

    let output = run_sweep(&base, &[]);

    assert!(
        output.status.success(),
        "expected success with corrupt object, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stderr);
    assert!(
        stdout.contains("corrupt") || stdout.contains("error") || stdout.contains("invalid"),
        "expected error marker for corrupt object in stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_deletes_old_artifacts() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base");

    write_artifact(&base, "old-artifact", 1);

    let artifact_dir = base.join("artifacts");
    assert!(artifact_dir.join("old-artifact.json").exists());

    let output = run_sweep(&base, &["--heartbeat-ttl", "0"]);

    assert!(
        output.status.success(),
        "expected success, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let _ = fs::remove_dir_all(&base);
}
