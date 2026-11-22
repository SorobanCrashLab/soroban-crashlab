use crashlab_core::{
    save_case_bundle_json, to_bundle, CaseSeed, CrashSignature,
};
use crashlab_core::bundle_persist::CaseBundleDocument;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_tmp() -> PathBuf {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir().join(format!("crashlab-replay-bridge-{n}"))
}

fn write_bundle_to_dir(dir: &PathBuf, name: &str, bundle: &crashlab_core::CaseBundle) -> PathBuf {
    fs::create_dir_all(dir).expect("create dir");
    let path = dir.join(name);
    let bytes = save_case_bundle_json(bundle).expect("serialize bundle");
    fs::write(&path, bytes).expect("write bundle");
    path
}

fn write_mismatched_bundle(dir: &PathBuf, name: &str, seed: CaseSeed) -> PathBuf {
    fs::create_dir_all(dir).expect("create dir");
    let bundle = to_bundle(seed.clone());
    let doc = CaseBundleDocument {
        schema: 1,
        seed: seed.clone(),
        signature: CrashSignature {
            category: "auth-failure".to_string(),
            digest: 0xDEAD,
            signature_hash: 0xBEEF,
        },
        environment: None,
        failure_payload: vec![],
        rpc_envelope: None,
        provenance: None,
        original_seed: None,
        shrink_lineage: None,
    engine_version: crashlab_core::engine_version::ENGINE_VERSION.to_string(),
    };
    let path = dir.join(name);
    let bytes = serde_json::to_vec(&doc).expect("serialize doc");
    fs::write(&path, bytes).expect("write bundle");
    let _ = bundle;
    path
}

#[test]
fn replay_cli_succeeds_for_matching_bundle() {
    let tmpdir = unique_tmp();
    let seed = CaseSeed {
        id: 1,
        payload: vec![1, 2, 3],
    };
    let bundle = to_bundle(seed);
    let bundle_path = write_bundle_to_dir(&tmpdir, "bundle.json", &bundle);

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .arg("replay")
        .arg("seed")
        .arg(&bundle_path)
        .output()
        .expect("run crashlab binary");

    assert!(
        output.status.success(),
        "expected success for matching bundle, got status {:?}\nstdout: {}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("replay matched"),
        "expected 'replay matched' in stdout: {stdout}"
    );

    let _ = fs::remove_dir_all(&tmpdir);
}

#[test]
fn replay_cli_fails_for_mismatched_signature() {
    let tmpdir = unique_tmp();
    let seed = CaseSeed {
        id: 2,
        payload: vec![4, 5, 6],
    };
    let bundle_path = write_mismatched_bundle(&tmpdir, "mismatch.json", seed);

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .arg("replay")
        .arg("seed")
        .arg(&bundle_path)
        .output()
        .expect("run crashlab binary");

    assert!(
        !output.status.success(),
        "expected non-zero exit for mismatched bundle, got status {:?}",
        output.status
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("replay mismatch"),
        "expected 'replay mismatch' in stderr: {stderr}"
    );

    let _ = fs::remove_dir_all(&tmpdir);
}

#[test]
fn replay_cli_fails_for_missing_file() {
    let tmpdir = unique_tmp();
    let nonexistent = tmpdir.join("does_not_exist.json");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .arg("replay")
        .arg("seed")
        .arg(&nonexistent)
        .output()
        .expect("run crashlab binary");

    assert!(
        !output.status.success(),
        "expected non-zero exit for missing file, got status {:?}",
        output.status
    );
}

#[test]
fn replay_cli_fails_for_invalid_json() {
    let tmpdir = unique_tmp();
    fs::create_dir_all(&tmpdir).expect("create dir");
    let bad_path = tmpdir.join("bad.json");
    fs::write(&bad_path, b"not valid json at all").expect("write bad file");

    let output = Command::new(env!("CARGO_BIN_EXE_crashlab"))
        .arg("replay")
        .arg("seed")
        .arg(&bad_path)
        .output()
        .expect("run crashlab binary");

    assert!(
        !output.status.success(),
        "expected non-zero exit for invalid json, got status {:?}",
        output.status
    );

    let _ = fs::remove_dir_all(&tmpdir);
}
