//! Sample regression test harness for crashlab-core.
//!
//! This harness demonstrates how to use generated regression test snippets
//! from `crashlab-core::scenario_export::write_rust_regression_snippet`.
//!
//! Generated snippets can be placed in the `tests/` directory and will be
//! automatically discovered and run by `cargo test`.

#[cfg(test)]
mod tests {
    use crashlab_core::{replay_seed_bundle, CaseBundle, CaseSeed, CrashSignature};

    /// Example manually-written regression test following the same pattern
    /// that generated snippets use.
    ///
    /// This test demonstrates:
    /// - How to construct a CaseBundle from known seed and signature values
    /// - How to use replay_seed_bundle to verify the failure reproduces
    /// - The assertion pattern that confirms signature matching
    #[test]
    fn example_manual_regression_test() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 1,
                payload: vec![0x13, 0x4c, 0xdb],
            },
            signature: CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 642423753474530485,
                signature_hash: 1138091377485572764,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let result = replay_seed_bundle(&bundle);
        assert_eq!(result.actual.category, "runtime-failure");
        assert_eq!(result.actual.digest, 642423753474530485);
        assert_eq!(result.actual.signature_hash, 1138091377485572764);
        assert!(
            result.matches,
            "replay should match exported failing bundle signature"
        );
    }
}
