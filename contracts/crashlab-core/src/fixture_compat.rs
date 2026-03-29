//! Fixture compatibility checker for the Soroban CrashLab engine.
//!
//! Checks whether a fixture set (seeds or bundle documents) matches the current
//! engine schema and capabilities, and reports actionable migration warnings.

use crate::bundle_persist::{CaseBundleDocument, SUPPORTED_BUNDLE_SCHEMAS};
use crate::seed_validator::SeedSchema;
use crate::{CaseSeed, Validate};

/// A migration warning produced by the fixture compatibility checker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompatWarning {
    /// Zero-based index of the fixture that triggered this warning.
    pub fixture_index: usize,
    /// Human-readable description of the incompatibility and suggested action.
    pub message: String,
}

/// Result of checking a fixture set against the current engine schema.
#[derive(Debug, Clone)]
pub struct CompatReport {
    /// Warnings for each incompatible fixture.
    pub warnings: Vec<CompatWarning>,
}

impl CompatReport {
    /// Returns `true` when no warnings were produced (all fixtures are compatible).
    pub fn is_compatible(&self) -> bool {
        self.warnings.is_empty()
    }
}

/// Checks a slice of [`CaseSeed`] fixtures against `schema`.
///
/// Returns a [`CompatReport`] with one warning per validation failure, including
/// which fixture is affected and what change is needed.
pub fn check_seed_fixtures(seeds: &[CaseSeed], schema: &SeedSchema) -> CompatReport {
    let mut warnings = Vec::new();
    for (i, seed) in seeds.iter().enumerate() {
        if let Err(errors) = seed.validate(schema) {
            for e in errors {
                warnings.push(CompatWarning {
                    fixture_index: i,
                    message: format!("seed[{}] id={}: {}", i, seed.id, e),
                });
            }
        }
    }
    CompatReport { warnings }
}

/// Checks a slice of [`CaseBundleDocument`] fixtures.
///
/// Each bundle document is checked for:
/// - Bundle schema version against [`SUPPORTED_BUNDLE_SCHEMAS`].
/// - Embedded seed against `schema`.
pub fn check_bundle_fixtures(docs: &[CaseBundleDocument], schema: &SeedSchema) -> CompatReport {
    let mut warnings = Vec::new();
    for (i, doc) in docs.iter().enumerate() {
        if !SUPPORTED_BUNDLE_SCHEMAS.contains(&doc.schema) {
            warnings.push(CompatWarning {
                fixture_index: i,
                message: format!(
                    "bundle[{}] schema version {} is not supported (supported: {:?}); \
                     re-export this bundle with the current engine",
                    i, doc.schema, SUPPORTED_BUNDLE_SCHEMAS
                ),
            });
        }

        if let Err(errors) = doc.seed.validate(schema) {
            for e in errors {
                warnings.push(CompatWarning {
                    fixture_index: i,
                    message: format!("bundle[{}] seed id={}: {}", i, doc.seed.id, e),
                });
            }
        }
    }
    CompatReport { warnings }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bundle_persist::CASE_BUNDLE_SCHEMA_VERSION;
    use crate::{to_bundle, CrashSignature};

    fn make_seed(id: u64, len: usize) -> CaseSeed {
        CaseSeed {
            id,
            payload: vec![1u8; len],
        }
    }

    fn make_doc(schema: u32, seed: CaseSeed) -> CaseBundleDocument {
        let sig = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0,
            signature_hash: 0,
        };
        CaseBundleDocument {
            schema,
            seed,
            signature: sig,
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        }
    }

    #[test]
    fn compatible_seeds_produce_no_warnings() {
        let seeds = vec![make_seed(1, 4), make_seed(2, 8)];
        let report = check_seed_fixtures(&seeds, &SeedSchema::default());
        assert!(report.is_compatible());
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn seed_too_short_produces_warning() {
        let seeds = vec![make_seed(1, 0)];
        let report = check_seed_fixtures(&seeds, &SeedSchema::default());
        assert!(!report.is_compatible());
        assert_eq!(report.warnings.len(), 1);
        assert_eq!(report.warnings[0].fixture_index, 0);
        assert!(report.warnings[0].message.contains("payload too short"));
    }

    #[test]
    fn seed_too_long_produces_warning() {
        let seeds = vec![make_seed(1, 65)];
        let report = check_seed_fixtures(&seeds, &SeedSchema::default());
        assert!(!report.is_compatible());
        assert!(report.warnings[0].message.contains("payload too long"));
    }

    #[test]
    fn multiple_invalid_seeds_all_reported() {
        let seeds = vec![make_seed(1, 0), make_seed(2, 4), make_seed(3, 65)];
        let report = check_seed_fixtures(&seeds, &SeedSchema::default());
        assert_eq!(report.warnings.len(), 2);
        assert_eq!(report.warnings[0].fixture_index, 0);
        assert_eq!(report.warnings[1].fixture_index, 2);
    }

    #[test]
    fn warning_message_includes_fixture_index_and_seed_id() {
        let seeds = vec![make_seed(42, 0)];
        let report = check_seed_fixtures(&seeds, &SeedSchema::default());
        let msg = &report.warnings[0].message;
        assert!(msg.contains("seed[0]"));
        assert!(msg.contains("id=42"));
    }

    #[test]
    fn compatible_bundles_produce_no_warnings() {
        let bundle = to_bundle(make_seed(1, 4));
        let doc = make_doc(CASE_BUNDLE_SCHEMA_VERSION, bundle.seed);
        let report = check_bundle_fixtures(&[doc], &SeedSchema::default());
        assert!(report.is_compatible());
    }

    #[test]
    fn unsupported_bundle_schema_produces_warning() {
        let doc = make_doc(999, make_seed(1, 4));
        let report = check_bundle_fixtures(&[doc], &SeedSchema::default());
        assert!(!report.is_compatible());
        assert_eq!(report.warnings[0].fixture_index, 0);
        assert!(report.warnings[0].message.contains("schema version 999"));
        assert!(report.warnings[0].message.contains("re-export"));
    }

    #[test]
    fn bundle_with_invalid_seed_produces_warning() {
        let doc = make_doc(CASE_BUNDLE_SCHEMA_VERSION, make_seed(1, 0));
        let report = check_bundle_fixtures(&[doc], &SeedSchema::default());
        assert!(!report.is_compatible());
        assert!(report.warnings[0].message.contains("payload too short"));
    }

    #[test]
    fn bundle_with_bad_schema_and_bad_seed_produces_two_warnings() {
        let doc = make_doc(999, make_seed(1, 0));
        let report = check_bundle_fixtures(&[doc], &SeedSchema::default());
        assert_eq!(report.warnings.len(), 2);
    }

    #[test]
    fn empty_fixture_set_is_compatible() {
        let seed_report = check_seed_fixtures(&[], &SeedSchema::default());
        let bundle_report = check_bundle_fixtures(&[], &SeedSchema::default());
        assert!(seed_report.is_compatible());
        assert!(bundle_report.is_compatible());
    }
}
