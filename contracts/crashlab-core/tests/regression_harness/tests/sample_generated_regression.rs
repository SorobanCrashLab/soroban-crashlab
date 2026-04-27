//! Sample generated regression test.
//!
//! This file demonstrates what a generated snippet looks like when written
//! by `write_rust_regression_snippet`. In practice, these would be generated
//! automatically from failing bundles captured during fuzzing campaigns.

#[test]
fn regression_seed_42_af88cf52() {
    use crashlab_core::{replay_seed_bundle, CaseBundle, CaseSeed, CrashSignature};

    let bundle = CaseBundle {
        seed: CaseSeed {
            id: 42,
            payload: vec![0xb6, 0xa0, 0xdf],
        },
        signature: CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 7942469581289707507,
            signature_hash: 10616223570442512235,
        },
        environment: None,
        failure_payload: vec![],
        rpc_envelope: None,
    };

    let result = replay_seed_bundle(&bundle);
    assert_eq!(result.actual.category, "runtime-failure");
    assert_eq!(result.actual.digest, 7942469581289707507);
    assert_eq!(result.actual.signature_hash, 10616223570442512235);
    assert!(
        result.matches,
        "replay should match exported failing bundle signature"
    );
}

#[test]
fn regression_seed_99_cbf29ce4() {
    use crashlab_core::{replay_seed_bundle, CaseBundle, CaseSeed, CrashSignature};

    let bundle = CaseBundle {
        seed: CaseSeed {
            id: 99,
            payload: vec![],
        },
        signature: CrashSignature {
            category: "empty-input".to_string(),
            digest: 99,
            signature_hash: 10130289593542214687,
        },
        environment: None,
        failure_payload: vec![],
        rpc_envelope: None,
    };

    let result = replay_seed_bundle(&bundle);
    assert_eq!(result.actual.category, "empty-input");
    assert_eq!(result.actual.digest, 99);
    assert_eq!(result.actual.signature_hash, 10130289593542214687);
    assert!(
        result.matches,
        "replay should match exported failing bundle signature"
    );
}
