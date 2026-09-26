use crashlab_core::bundle_persist::CaseBundleDocument;
use crashlab_core::{
    to_bundle, ArtifactStore, CaseSeed, LocalArtifactStore, RetentionPolicy, RunCheckpoint,
};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_tmp() -> PathBuf {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir().join(format!("crashlab-retention-sweep-{n}"))
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
    };
    let path = artifact_dir.join(format!("{artifact_id}.json"));
    let bytes = serde_json::to_vec(&doc).expect("serialize doc");
    fs::write(path, bytes).expect("write artifact");
}

#[test]
fn retention_sweep_prints_summary_on_empty_state_dir() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep"])
        .output()
        .expect("run crashlab binary");

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
fn retention_sweep_retains_runs_within_policy() {
    let base = unique_tmp();

    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;

    // Write exactly as many runs as the policy allows per campaign
    for i in 0..max_checkpoints {
        let cp = make_checkpoint("camp-a", i * 100, 1000);
        write_checkpoint(&base, i as u64, &cp);
    }

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep"])
        .output()
        .expect("run crashlab binary");

    assert!(
        output.status.success(),
        "expected success, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    // All runs should still exist because they are within the policy cap
    let runs_dir = base.join("runs");
    let remaining = fs::read_dir(&runs_dir)
        .expect("read runs dir")
        .filter(|e| e.as_ref().map(|d| d.path().is_dir()).unwrap_or(false))
        .count();
    assert_eq!(
        remaining, max_checkpoints,
        "all {max_checkpoints} runs should be retained"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_prunes_excess_checkpoints() {
    use filetime::FileTime;

    let base = unique_tmp();

    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;
    let total_runs = max_checkpoints + 3;

    // Write more runs than the policy allows for one campaign.
    // The retention logic also keeps anything within the checkpoint_retention_window
    // (default 14 days), so we must backdate the excess checkpoint files to be
    // older than that window to let the count-based pruning take effect.
    let thirty_days_ago = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time")
        .as_secs()
        - 30 * 24 * 3600;

    for i in 0..total_runs {
        let cp = make_checkpoint("camp-b", i * 10, 500);
        write_checkpoint(&base, i as u64, &cp);

        // Backdate checkpoint file modification time to 30 days ago so it falls
        // outside the default 14-day checkpoint_retention_window.
        let cp_path = base
            .join("runs")
            .join(i.to_string())
            .join("checkpoint.json");
        let old_time = FileTime::from_unix_time(thirty_days_ago as i64, 0);
        filetime::set_file_mtime(&cp_path, old_time).expect("set mtime");
    }

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep"])
        .output()
        .expect("run crashlab binary");

    assert!(
        output.status.success(),
        "expected success, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let runs_dir = base.join("runs");
    let remaining = fs::read_dir(&runs_dir)
        .expect("read runs dir")
        .filter(|e| e.as_ref().map(|d| d.path().is_dir()).unwrap_or(false))
        .count();

    assert!(
        remaining <= max_checkpoints,
        "expected at most {max_checkpoints} runs after sweep, found {remaining}"
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("checkpoint(s)"),
        "expected checkpoint prune message in stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_prunes_excess_failure_bundles() {
    let base = unique_tmp();

    let policy = RetentionPolicy::default();
    let max_bundles = policy.max_failure_bundles;
    let total_bundles = max_bundles + 5;

    // Write more bundles than the policy retains
    for i in 0..total_bundles {
        write_artifact(&base, &format!("artifact-{i:04}"), i as u64);
    }

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep"])
        .output()
        .expect("run crashlab binary");

    assert!(
        output.status.success(),
        "expected success, status {:?}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    // Count remaining artifacts on disk
    let artifact_dir = base.join("artifacts");
    let store = LocalArtifactStore::new(&artifact_dir).expect("open store");
    let remaining = store.list_artifacts().expect("list artifacts").len();

    assert!(
        remaining <= max_bundles,
        "expected at most {max_bundles} bundles after sweep, found {remaining}"
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("bundle(s)"),
        "expected bundle prune message in stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_rejects_extra_arguments() {
    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .args(["retention", "sweep", "unexpected-arg"])
        .output()
        .expect("run crashlab binary");

    assert!(
        !output.status.success(),
        "expected failure for extra arguments, got {:?}",
        output.status
    );
}
