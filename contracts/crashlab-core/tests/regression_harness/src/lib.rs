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
    use crashlab_core::taxonomy::{classify_failure, FailureClass};

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
                category: "xdr".to_string(),
                digest: 642423753474530485,
                signature_hash: 14408820248937076130,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let result = replay_seed_bundle(&bundle);
        assert_eq!(result.actual.category, "xdr");
        assert_eq!(result.actual.digest, 642423753474530485);
        assert_eq!(result.actual.signature_hash, 14408820248937076130);
        assert!(
            result.matches,
            "replay should match exported failing bundle signature"
        );
    }

    /// Guard: harness category labels stay aligned with taxonomy `FailureClass` strings.
    /// If taxonomy labels change, regenerate harness expectations (and this snapshot).
    #[test]
    fn taxonomy_label_snapshot_matches_harness_categories() {
        let expected = [
            (FailureClass::Auth, "auth"),
            (FailureClass::Budget, "budget"),
            (FailureClass::State, "state"),
            (FailureClass::Xdr, "xdr"),
            (FailureClass::InvalidEnumTag, "invalid-enum-tag"),
            (FailureClass::EmptyInput, "empty-input"),
            (FailureClass::OversizedInput, "oversized-input"),
            (FailureClass::Unknown, "unknown"),
            (FailureClass::Timeout, "timeout"),
            (FailureClass::InternalPanic, "internal-panic"),
        ];
        for (class, label) in expected {
            assert_eq!(class.as_str(), label);
        }
        // Payloads used by harness fixtures must classify to the labels we assert.
        assert_eq!(
            classify_failure(&CaseSeed { id: 1, payload: vec![0x13, 0x4c, 0xdb] }),
            FailureClass::Xdr
        );
        assert_eq!(
            classify_failure(&CaseSeed { id: 42, payload: vec![0xb6, 0xa0, 0xdf] }),
            FailureClass::Auth
        );
        assert_eq!(
            classify_failure(&CaseSeed { id: 99, payload: vec![] }),
            FailureClass::EmptyInput
        );
    }
}
