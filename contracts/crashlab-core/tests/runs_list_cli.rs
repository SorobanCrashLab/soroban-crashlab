use crashlab_core::{RunId, request_cancel_run};
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
    std::env::temp_dir().join(format!("crashlab-runs-list-{pid}-{n}-{seq}"))
}

#[test]
fn runs_list_empty_state_dir_prints_no_runs() {
    let base = unique_tmp();
    fs::create_dir_all(&base).expect("create base dir");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["runs", "list"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("no runs found"), "unexpected stdout: {stdout}");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_list_shows_active_run() {
    let base = unique_tmp();
    // Create a run directory without a cancel marker.
    let run_dir = base.join("runs").join("7");
    fs::create_dir_all(&run_dir).expect("create run dir");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["runs", "list"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("7"), "expected run id 7 in output: {stdout}");
    assert!(stdout.contains("active"), "expected 'active' status: {stdout}");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_list_shows_cancelled_run() {
    let base = unique_tmp();
    request_cancel_run(RunId(3), &base).expect("request cancel");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["runs", "list"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("3"), "expected run id 3 in output: {stdout}");
    assert!(stdout.contains("cancelled"), "expected 'cancelled' status: {stdout}");

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn runs_list_sorts_ids_ascending() {
    let base = unique_tmp();
    for id in [10u64, 2, 5] {
        fs::create_dir_all(base.join("runs").join(id.to_string())).expect("create run dir");
    }

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .env("CRASHLAB_STATE_DIR", &base)
        .args(["runs", "list"])
        .output()
        .expect("run crashlab binary");

    assert!(output.status.success(), "expected success");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let positions: Vec<usize> = ["2", "5", "10"]
        .iter()
        .map(|id| stdout.find(id).expect("id not found"))
        .collect();
    assert!(
        positions.windows(2).all(|w| w[0] < w[1]),
        "expected ascending order: {stdout}"
    );

    let _ = fs::remove_dir_all(&base);
}
