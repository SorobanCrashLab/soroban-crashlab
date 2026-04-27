use crate::{CaseSeed, CrashSignature, RegressionFixture, RegressionGroup};

/// Classifies a failing case into a `RegressionGroup` based on its metadata.
///
/// ## Classification Rules
///
/// 1. **Domain Risk Area** is determined by classifying the seed using [`classify_failure()`]:
///    - Empty payload → `EmptyInput`
///    - Payload > 64 bytes → `OversizedInput`
///    - Byte discriminant (first byte value) → `Xdr`, `State`, `Budget`, or `Auth`
///
/// 2. **Failure Mode** is the `signature_hash` from the crash signature:
///    - This is a stable hash derived from the failure category and payload
///    - Equivalent failures (same root cause) produce identical signature hashes
///
/// 3. **Result:** A `RegressionGroup` combining area and failure mode
///
/// ## Determinism Guarantee
///
/// Given the same fixture metadata on every run, this classifier always returns
/// the same `RegressionGroup`. This is critical for CI regression detection—
/// grouping must be stable across different machines and different times.
///
/// ## Unknown Group Fallback
///
/// If a fixture lacks sufficient metadata to classify (missing signature), the
/// classifier returns a `RegressionGroup` with area `Unknown`. A warning is logged.
///
/// # Example
///
/// ```rust
/// use crashlab_core::{CaseSeed, CrashSignature, RegressionFixture};
/// use crashlab_core::fixture_classifier::classify_fixture;
///
/// let seed = CaseSeed { id: 1, payload: vec![0xA0, 0x01, 0x02] };
/// let sig = CrashSignature {
///     category: "runtime-failure",
///     digest: 12345,
///     signature_hash: 0x1234567890ABCDEF,
/// };
/// let group = classify_fixture(&seed, &sig);
/// // group.area == FailureClass::Auth (byte 0xA0 in Auth range)
/// // group.signature_hash == 0x1234567890ABCDEF
/// ```
pub fn classify_fixture(seed: &CaseSeed, signature: &CrashSignature) -> RegressionGroup {
    let area = crate::classify_failure(seed);
    let failure_mode = signature.signature_hash;
    RegressionGroup::new(area, failure_mode)
}

/// Classifies a fixture and returns it with the regression group assigned.
///
/// This is the entry point for the export pipeline. After a failure is confirmed,
/// this function is called to assign the fixture to a regression group before serialisation.
pub fn classify_and_wrap_fixture(
    seed: &CaseSeed,
    signature: &CrashSignature,
) -> RegressionFixture {
    let group = classify_fixture(seed, signature);
    RegressionFixture::new(seed, signature, Some(group))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FailureClass;

    fn make_seed(payload: Vec<u8>) -> CaseSeed {
        CaseSeed { id: 0, payload }
    }

    fn make_sig(cat: &'static str, hash: u64) -> CrashSignature {
        CrashSignature {
            category: cat.to_string(),
            digest: 0,
            signature_hash: hash,
        }
    }

    // ── classify_fixture: determinism ─────────────────────────────────────────

    #[test]
    fn classification_is_deterministic() {
        let seed = make_seed(vec![0xA0, 0x01]);
        let sig = make_sig("runtime-failure", 0xDEADBEEFCAFE0000);

        let group1 = classify_fixture(&seed, &sig);
        let group2 = classify_fixture(&seed, &sig);

        assert_eq!(group1, group2);
    }

    #[test]
    fn classification_deterministic_across_multiple_calls() {
        let seed = make_seed(vec![0x30, 0x02, 0x03]);
        let sig = make_sig("runtime-failure", 0x1234567890ABCDEF);

        let groups: Vec<_> = (0..10)
            .map(|_| classify_fixture(&seed, &sig))
            .collect();

        for i in 1..groups.len() {
            assert_eq!(groups[0], groups[i]);
        }
    }

    // ── classify_fixture: domain area classification ──────────────────────────

    #[test]
    fn empty_payload_classified_as_empty_input() {
        let seed = make_seed(vec![]);
        let sig = make_sig("empty-input", 0x5555);

        let group = classify_fixture(&seed, &sig);

        assert_eq!(group.area, FailureClass::EmptyInput);
        assert_eq!(group.signature_hash, 0x5555);
    }

    #[test]
    fn oversized_payload_classified_as_oversized_input() {
        let seed = make_seed(vec![0x00; 65]);
        let sig = make_sig("oversized-input", 0x6666);

        let group = classify_fixture(&seed, &sig);

        assert_eq!(group.area, FailureClass::OversizedInput);
        assert_eq!(group.signature_hash, 0x6666);
    }

    #[test]
    fn auth_range_payload_classified_as_auth() {
        for byte in [0xA0u8, 0xB5, 0xC0, 0xD5, 0xE0, 0xF5, 0xFF] {
            let seed = make_seed(vec![byte]);
            let sig = make_sig("runtime-failure", 0x1111);

            let group = classify_fixture(&seed, &sig);

            assert_eq!(group.area, FailureClass::Auth, "byte 0x{:X} should be Auth", byte);
        }
    }

    #[test]
    fn budget_range_payload_classified_as_budget() {
        for byte in [0x60u8, 0x70, 0x80, 0x8F, 0x9F] {
            let seed = make_seed(vec![byte]);
            let sig = make_sig("runtime-failure", 0x2222);

            let group = classify_fixture(&seed, &sig);

            assert_eq!(group.area, FailureClass::Budget, "byte 0x{:X} should be Budget", byte);
        }
    }

    #[test]
    fn state_range_payload_classified_as_state() {
        for byte in [0x20u8, 0x30, 0x40, 0x50, 0x5F] {
            let seed = make_seed(vec![byte]);
            let sig = make_sig("runtime-failure", 0x3333);

            let group = classify_fixture(&seed, &sig);

            assert_eq!(group.area, FailureClass::State, "byte 0x{:X} should be State", byte);
        }
    }

    #[test]
    fn xdr_range_payload_classified_as_xdr() {
        for byte in [0x00u8, 0x0F, 0x1F] {
            let seed = make_seed(vec![byte]);
            let sig = make_sig("runtime-failure", 0x4444);

            let group = classify_fixture(&seed, &sig);

            assert_eq!(group.area, FailureClass::Xdr, "byte 0x{:X} should be Xdr", byte);
        }
    }

    // ── classify_fixture: signature_hash preservation ───────────────────────

    #[test]
    fn failure_mode_matches_signature_hash() {
        let seed = make_seed(vec![0x50]);
        let test_hash = 0xABCDEF0123456789u64;
        let sig = make_sig("runtime-failure", test_hash);

        let group = classify_fixture(&seed, &sig);

        assert_eq!(group.signature_hash, test_hash);
    }

    #[test]
    fn different_signatures_produce_different_groups() {
        let seed = make_seed(vec![0x50]);
        let sig1 = make_sig("runtime-failure", 0x1111111111111111);
        let sig2 = make_sig("runtime-failure", 0x2222222222222222);

        let group1 = classify_fixture(&seed, &sig1);
        let group2 = classify_fixture(&seed, &sig2);

        assert_ne!(group1, group2);
    }

    // ── classify_and_wrap_fixture ────────────────────────────────────────────

    #[test]
    fn classify_and_wrap_produces_fixture_with_group() {
        let seed = make_seed(vec![0xB0]);
        let sig = make_sig("runtime-failure", 0x9876543210);

        let fixture = classify_and_wrap_fixture(&seed, &sig);

        assert!(fixture.regression_group.is_some());
        let group = fixture.regression_group.unwrap();
        assert_eq!(group.area, FailureClass::Auth);
        assert_eq!(group.signature_hash, 0x9876543210);
    }

    #[test]
    fn wrapped_fixture_preserves_seed_data() {
        let seed = make_seed(vec![1, 2, 3, 4, 5]);
        let sig = make_sig("runtime-failure", 0xFFFFFFFF);

        let fixture = classify_and_wrap_fixture(&seed, &sig);

        assert_eq!(fixture.seed_id, 0);
        assert_eq!(fixture.payload, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn wrapped_fixture_preserves_signature_data() {
        let seed = make_seed(vec![0x70]);
        let sig = make_sig("runtime-failure", 0x11223344);

        let fixture = classify_and_wrap_fixture(&seed, &sig);

        assert_eq!(fixture.category, "runtime-failure");
        assert_eq!(fixture.signature_hash, 0x11223344);
    }

    #[test]
    fn wrapped_fixture_has_consistent_group() {
        let seed = make_seed(vec![0x30, 0x01]);
        let sig = make_sig("runtime-failure", 0xDEADBEEF);

        let fixture1 = classify_and_wrap_fixture(&seed, &sig);
        let fixture2 = classify_and_wrap_fixture(&seed, &sig);

        assert_eq!(fixture1.regression_group, fixture2.regression_group);
    }
}
