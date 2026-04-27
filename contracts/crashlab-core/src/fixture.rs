use crate::{CaseSeed, CrashSignature, RegressionGroup};

/// A regression fixture stores a failing case along with its metadata for reproducibility.
///
/// Fixtures are exported at the point where a failure is confirmed and stabilized.
/// Each fixture preserves:
///
/// - The exact seed (payload and ID) that triggered the failure
/// - The failure signature (category, digest, signature_hash)
/// - The regression group (domain risk area and failure mode)
/// - Metadata for CI reproduction and triage
///
/// Fixtures are designed to round-trip through serialisation without loss of fidelity,
/// enabling deterministic replay and regression detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegressionFixture {
    /// Unique identifier for this seed within a corpus.
    pub seed_id: u64,
    /// The input payload that triggered the failure.
    pub payload: Vec<u8>,
    /// The failure category (e.g., "runtime-failure", "empty-input").
    pub category: String,
    /// Stable hash derived from category and payload bytes.
    pub signature_hash: u64,
    /// The regression group this fixture belongs to (None if unclassified).
    pub regression_group: Option<RegressionGroup>,
}

impl RegressionFixture {
    /// Creates a new regression fixture from a seed and crash signature.
    ///
    /// The regression_group is optional and can be assigned during export via the classifier.
    pub fn new(
        seed: &CaseSeed,
        signature: &CrashSignature,
        regression_group: Option<RegressionGroup>,
    ) -> Self {
        Self {
            seed_id: seed.id,
            payload: seed.payload.clone(),
            category: signature.category.to_string(),
            signature_hash: signature.signature_hash,
            regression_group,
        }
    }

    /// Creates a fixture from individual components.
    pub fn from_parts(
        seed_id: u64,
        payload: Vec<u8>,
        category: String,
        signature_hash: u64,
        regression_group: Option<RegressionGroup>,
    ) -> Self {
        Self { seed_id, payload, category, signature_hash, regression_group }
    }

    /// Reconstructs the CaseSeed for this fixture (for replay).
    pub fn to_seed(&self) -> CaseSeed {
        CaseSeed { id: self.seed_id, payload: self.payload.clone() }
    }

    /// The regression group for this fixture, or a default "unknown" group if unclassified.
    pub fn group_or_unknown(&self) -> RegressionGroup {
        self.regression_group.unwrap_or_else(|| {
            RegressionGroup::new(crate::FailureClass::Unknown, self.signature_hash)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_new_from_seed_and_signature() {
        let seed = CaseSeed { id: 42, payload: vec![1, 2, 3] };
        let sig = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0xABCD,
            signature_hash: 0x1234567890ABCDEF,
        };
        let group = Some(RegressionGroup::new(crate::FailureClass::Auth, 0x1234567890ABCDEF));

        let fixture = RegressionFixture::new(&seed, &sig, group);

        assert_eq!(fixture.seed_id, 42);
        assert_eq!(fixture.payload, vec![1, 2, 3]);
        assert_eq!(fixture.category, "runtime-failure");
        assert_eq!(fixture.signature_hash, 0x1234567890ABCDEF);
        assert_eq!(fixture.regression_group, group);
    }

    #[test]
    fn fixture_new_without_group() {
        let seed = CaseSeed { id: 1, payload: vec![255] };
        let sig = CrashSignature {
            category: "empty-input".to_string(),
            digest: 0xFFFF,
            signature_hash: 0x5555555555555555,
        };

        let fixture = RegressionFixture::new(&seed, &sig, None);

        assert_eq!(fixture.regression_group, None);
    }

    #[test]
    fn fixture_from_parts() {
        let group = Some(RegressionGroup::new(crate::FailureClass::Budget, 0xAAAAAAAAAAAAAAAA));
        let fixture = RegressionFixture::from_parts(
            99,
            vec![10, 20, 30],
            "budget".to_string(),
            0xAAAAAAAAAAAAAAAA,
            group,
        );

        assert_eq!(fixture.seed_id, 99);
        assert_eq!(fixture.payload, vec![10, 20, 30]);
        assert_eq!(fixture.category, "budget");
        assert_eq!(fixture.signature_hash, 0xAAAAAAAAAAAAAAAA);
        assert_eq!(fixture.regression_group, group);
    }

    #[test]
    fn fixture_to_seed_round_trip() {
        let original_seed = CaseSeed { id: 77, payload: vec![4, 5, 6] };
        let sig = CrashSignature {
            category: "state".to_string(),
            digest: 0x1111,
            signature_hash: 0xCCCCCCCCCCCCCCCC,
        };
        let fixture = RegressionFixture::new(&original_seed, &sig, None);

        let restored_seed = fixture.to_seed();

        assert_eq!(restored_seed.id, original_seed.id);
        assert_eq!(restored_seed.payload, original_seed.payload);
    }

    #[test]
    fn fixture_equality() {
        let seed1 = CaseSeed { id: 1, payload: vec![1] };
        let seed2 = CaseSeed { id: 1, payload: vec![1] };
        let sig = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0x1234,
            signature_hash: 0x1234567890ABCDEF,
        };
        let group = Some(RegressionGroup::new(crate::FailureClass::Xdr, 0x1234567890ABCDEF));

        let f1 = RegressionFixture::new(&seed1, &sig, group);
        let f2 = RegressionFixture::new(&seed2, &sig, group);

        assert_eq!(f1, f2);
    }

    #[test]
    fn fixture_with_group_or_unknown_when_present() {
        let seed = CaseSeed { id: 1, payload: vec![1] };
        let sig = CrashSignature {
            category: "auth".to_string(),
            digest: 0x0,
            signature_hash: 0x9999999999999999,
        };
        let group = RegressionGroup::new(crate::FailureClass::Auth, 0x9999999999999999);
        let fixture = RegressionFixture::new(&seed, &sig, Some(group));

        let result = fixture.group_or_unknown();
        assert_eq!(result, group);
    }

    #[test]
    fn fixture_with_group_or_unknown_when_absent() {
        let seed = CaseSeed { id: 2, payload: vec![2] };
        let sig = CrashSignature {
            category: "oversized-input".to_string(),
            digest: 0x0,
            signature_hash: 0x7777777777777777,
        };
        let fixture = RegressionFixture::new(&seed, &sig, None);

        let result = fixture.group_or_unknown();
        assert_eq!(result.area, crate::FailureClass::Unknown);
        assert_eq!(result.signature_hash, 0x7777777777777777);
    }

    #[test]
    fn fixture_cloneable() {
        let seed = CaseSeed { id: 5, payload: vec![5] };
        let sig = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0x0,
            signature_hash: 0x1111111111111111,
        };
        let group = Some(RegressionGroup::new(crate::FailureClass::Budget, 0x1111111111111111));
        let fixture1 = RegressionFixture::new(&seed, &sig, group);
        let fixture2 = fixture1.clone();

        assert_eq!(fixture1, fixture2);
    }
}
