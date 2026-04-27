use crate::FailureClass;
use std::fmt;

/// Composite grouping key for regression fixtures combining domain risk area and failure mode.
///
/// A `RegressionGroup` uniquely identifies a class of related failures. It consists of:
///
/// 1. **Domain Risk Area** (`FailureClass`): The type of failure encountered (Auth, Budget, State, etc.)
/// 2. **Failure Mode** (`signature_hash: u64`): Stable hash of the failure signature, derived from
///    the failure category and payload bytes. Two failures with the same root cause produce the same
///    failure mode hash.
///
/// ## Stability Guarantee
///
/// Given the same domain risk area and failure mode, the serialised form of a `RegressionGroup`
/// is guaranteed never to change across future codebase versions. This ensures that:
///
/// - Fixtures grouped under one RegressionGroup in the past remain in that group in the future
/// - Group identifiers can be safely stored and referenced in CI pipelines
/// - Comparing group identifiers across runs is deterministic
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RegressionGroup {
    /// The domain risk area (failure category) for this group.
    pub area: FailureClass,
    /// Stable hash of the failure signature; used to distinguish root causes within a domain.
    pub signature_hash: u64,
}

impl RegressionGroup {
    /// Creates a new regression group from a domain area and signature hash.
    pub fn new(area: FailureClass, signature_hash: u64) -> Self {
        Self { area, signature_hash }
    }

    /// Returns a stable string representation of this group in the format `area#hash`.
    ///
    /// This format is human-readable and can be parsed back for CLI usage. The area name
    /// is the stable string label from [`FailureClass::as_str()`].
    pub fn to_stable_string(&self) -> String {
        format!("{}#{:x}", self.area.as_str(), self.signature_hash)
    }

    /// Parses a stable group identifier from the format `area#hash`.
    ///
    /// Returns `None` if the area name is not recognised or the hash is not valid hex.
    pub fn from_stable_string(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split('#').collect();
        if parts.len() != 2 {
            return None;
        }

        let area_str = parts[0];
        let hash_str = parts[1];

        let area = match area_str {
            "auth" => FailureClass::Auth,
            "budget" => FailureClass::Budget,
            "state" => FailureClass::State,
            "xdr" => FailureClass::Xdr,
            "invalid-enum-tag" => FailureClass::InvalidEnumTag,
            "empty-input" => FailureClass::EmptyInput,
            "oversized-input" => FailureClass::OversizedInput,
            "unknown" => FailureClass::Unknown,
            "timeout" => FailureClass::Timeout,
            _ => return None,
        };

        let signature_hash = u64::from_str_radix(hash_str, 16).ok()?;
        Some(RegressionGroup { area, signature_hash })
    }
}

impl fmt::Display for RegressionGroup {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_stable_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regression_group_equality() {
        let g1 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let g2 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        assert_eq!(g1, g2);
    }

    #[test]
    fn regression_group_inequality_different_area() {
        let g1 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let g2 = RegressionGroup::new(FailureClass::Budget, 0x1234567890ABCDEF);
        assert_ne!(g1, g2);
    }

    #[test]
    fn regression_group_inequality_different_hash() {
        let g1 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let g2 = RegressionGroup::new(FailureClass::Auth, 0xFEDCBA0987654321);
        assert_ne!(g1, g2);
    }

    #[test]
    fn regression_group_hashable() {
        use std::collections::HashSet;
        let g1 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let g2 = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let mut set = HashSet::new();
        set.insert(g1);
        assert!(set.contains(&g2));
    }

    #[test]
    fn stable_string_format() {
        let g = RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF);
        let s = g.to_stable_string();
        assert_eq!(s, "auth#1234567890abcdef");
    }

    #[test]
    fn stable_string_all_variants() {
        for &area in &FailureClass::ALL {
            let g = RegressionGroup::new(area, 0xDEADBEEF);
            let s = g.to_stable_string();
            assert!(s.starts_with(area.as_str()));
            assert!(s.contains('#'));
        }
    }

    #[test]
    fn parse_stable_string_auth() {
        let parsed = RegressionGroup::from_stable_string("auth#1234567890abcdef");
        assert_eq!(parsed, Some(RegressionGroup::new(FailureClass::Auth, 0x1234567890ABCDEF)));
    }

    #[test]
    fn parse_stable_string_budget() {
        let parsed = RegressionGroup::from_stable_string("budget#deadbeef");
        assert_eq!(parsed, Some(RegressionGroup::new(FailureClass::Budget, 0xDEADBEEF)));
    }

    #[test]
    fn parse_stable_string_all_variants() {
        for &area in &FailureClass::ALL {
            let g = RegressionGroup::new(area, 0x1234);
            let s = g.to_stable_string();
            let parsed = RegressionGroup::from_stable_string(&s);
            assert_eq!(parsed, Some(g));
        }
    }

    #[test]
    fn parse_stable_string_invalid_area() {
        let parsed = RegressionGroup::from_stable_string("invalid-area#1234");
        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_stable_string_invalid_hash() {
        let parsed = RegressionGroup::from_stable_string("auth#not-hex");
        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_stable_string_missing_hash() {
        let parsed = RegressionGroup::from_stable_string("auth");
        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_stable_string_extra_parts() {
        let parsed = RegressionGroup::from_stable_string("auth#1234#extra");
        assert_eq!(parsed, None);
    }

    #[test]
    fn display_matches_stable_string() {
        let g = RegressionGroup::new(FailureClass::State, 0x99887766);
        assert_eq!(g.to_string(), g.to_stable_string());
    }

    #[test]
    fn round_trip_serialisation() {
        let original = RegressionGroup::new(FailureClass::Xdr, 0xABCDEF00);
        let serialised = original.to_stable_string();
        let deserialised = RegressionGroup::from_stable_string(&serialised);
        assert_eq!(Some(original), deserialised);
    }

    #[test]
    fn round_trip_multiple_groups() {
        let groups = vec![
            RegressionGroup::new(FailureClass::Auth, 0x1111111111111111),
            RegressionGroup::new(FailureClass::Budget, 0x2222222222222222),
            RegressionGroup::new(FailureClass::State, 0x3333333333333333),
            RegressionGroup::new(FailureClass::Xdr, 0x4444444444444444),
            RegressionGroup::new(FailureClass::EmptyInput, 0x5555555555555555),
            RegressionGroup::new(FailureClass::OversizedInput, 0x6666666666666666),
            RegressionGroup::new(FailureClass::Unknown, 0x7777777777777777),
        ];

        for original in groups {
            let serialised = original.to_stable_string();
            let deserialised = RegressionGroup::from_stable_string(&serialised);
            assert_eq!(Some(original), deserialised);
        }
    }
}
