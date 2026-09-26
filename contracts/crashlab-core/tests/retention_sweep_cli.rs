use crashlab_core::{
    LocalArtifactStore, ArtifactStore, RetentionPolicy, RunCheckpoint,
    to_bundle, CaseSeed,
};
use crashlab_core::bundle_persist::CaseBundleDocument;
use crashlab_core::checkpoint::RUN_CHECKPOINT_SCHEMA_VERSION;
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
    RunCheckpoint {
        schema: RUN_CHECKPOINT_SCHEMA_VERSION,
        campaign_id: campaign_id.to_string(),
        next_seed_index,
        total_seeds,
    }
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

#[test]
fn retention_sweep_preserves_directory_with_live_heartbeat() {
    use filetime::FileTime;
    use crashlab_core::stale_detector::write_heartbeat;

    let base = unique_tmp();
    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;
    let total_runs = max_checkpoints + 2;

    let thirty_days_ago = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time")
        .as_secs()
        - 30 * 24 * 3600;

    for i in 0..total_runs {
        let cp = make_checkpoint("camp-hb", i * 10, 500);
        write_checkpoint(&base, i as u64, &cp);

        let cp_path = base.join("runs").join(i.to_string()).join("checkpoint.json");
        let old_time = FileTime::from_unix_time(thirty_days_ago as i64, 0);
        filetime::set_file_mtime(&cp_path, old_time).expect("set mtime");
    }

    // Write a live heartbeat in run 0 (which would otherwise be pruned as an older/excess checkpoint)
    let live_run_dir = base.join("runs").join("0");
    write_heartbeat(&live_run_dir).expect("write heartbeat");

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

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("live heartbeat detected"),
        "expected live heartbeat log in stdout: {stdout}"
    );

    // Verify run 0 is preserved on disk
    assert!(
        live_run_dir.exists(),
        "run directory with live heartbeat must not be deleted"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_preserves_directory_with_advisory_lock() {
    use filetime::FileTime;
    use crashlab_core::stale_detector::RunDirLock;

    let base = unique_tmp();
    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;
    let total_runs = max_checkpoints + 2;

    let thirty_days_ago = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time")
        .as_secs()
        - 30 * 24 * 3600;

    for i in 0..total_runs {
        let cp = make_checkpoint("camp-lock", i * 10, 500);
        write_checkpoint(&base, i as u64, &cp);

        let cp_path = base.join("runs").join(i.to_string()).join("checkpoint.json");
        let old_time = FileTime::from_unix_time(thirty_days_ago as i64, 0);
        filetime::set_file_mtime(&cp_path, old_time).expect("set mtime");
    }

    let locked_run_dir = base.join("runs").join("0");
    let lock = RunDirLock::try_acquire(&locked_run_dir).expect("acquire lock");
    assert!(lock.is_some());

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

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("advisory lock held"),
        "expected lock held log in stdout: {stdout}"
    );

    assert!(
        locked_run_dir.exists(),
        "locked run directory must not be deleted"
    );

    drop(lock);
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_prunes_stale_heartbeat() {
    use filetime::FileTime;
    use crashlab_core::stale_detector::write_heartbeat_at;

    let base = unique_tmp();
    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;
    let total_runs = max_checkpoints + 2;

    let thirty_days_ago = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time")
        .as_secs()
        - 30 * 24 * 3600;

    for i in 0..total_runs {
        let cp = make_checkpoint("camp-stale-hb", i * 10, 500);
        write_checkpoint(&base, i as u64, &cp);

        let cp_path = base.join("runs").join(i.to_string()).join("checkpoint.json");
        let old_time = FileTime::from_unix_time(thirty_days_ago as i64, 0);
        filetime::set_file_mtime(&cp_path, old_time).expect("set mtime");
    }

    // Write a stale heartbeat (10 minutes ago, TTL is 60s)
    let stale_time = chrono::Utc::now() - chrono::Duration::minutes(10);
    let stale_run_dir = base.join("runs").join("0");
    write_heartbeat_at(&stale_run_dir, stale_time).expect("write stale heartbeat");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success());
    assert!(
        !stale_run_dir.exists(),
        "run directory with expired heartbeat should be pruned"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn retention_sweep_dry_run_preserves_directories() {
    use filetime::FileTime;

    let base = unique_tmp();
    let policy = RetentionPolicy::default();
    let max_checkpoints = policy.max_checkpoints_per_campaign;
    let total_runs = max_checkpoints + 2;

    let thirty_days_ago = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time")
        .as_secs()
        - 30 * 24 * 3600;

    for i in 0..total_runs {
        let cp = make_checkpoint("camp-dry", i * 10, 500);
        write_checkpoint(&base, i as u64, &cp);

        let cp_path = base.join("runs").join(i.to_string()).join("checkpoint.json");
        let old_time = FileTime::from_unix_time(thirty_days_ago as i64, 0);
        filetime::set_file_mtime(&cp_path, old_time).expect("set mtime");
    }

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["retention", "sweep", "--dry-run"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("(dry-run)"));

    let runs_dir = base.join("runs");
    let remaining = fs::read_dir(&runs_dir)
        .expect("read runs dir")
        .filter(|e| e.as_ref().map(|d| d.path().is_dir()).unwrap_or(false))
        .count();
    assert_eq!(remaining, total_runs, "dry run must not delete directories");

    let _ = fs::remove_dir_all(&base);
}
