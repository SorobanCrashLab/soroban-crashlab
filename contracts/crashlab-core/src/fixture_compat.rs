//! Fixture compatibility checker for the Soroban CrashLab engine.
//!
//! Checks whether a fixture set (seeds or bundle documents) matches the current
//! engine schema and capabilities, and reports actionable migration warnings.
//!
//! # Checks
//!
//! | Function | What it checks |
//! |---|---|
//! | [`check_seed_fixtures`] | Seed payload length and ID bounds against [`SeedSchema`] |
//! | [`check_bundle_fixtures`] | Bundle schema version + embedded seed bounds |
//! | [`check_seed_sanitization`] | Seeds that contain live secret-like fragments |
//! | [`check_manifest_engine_schema`] | Manifest's recorded engine schema vs. supported versions |
//! | [`check_bundle_signature_hashes`] | Stored `signature_hash` vs. recomputed hash |

use crate::bundle_persist::{CaseBundleDocument, SUPPORTED_BUNDLE_SCHEMAS};
use crate::fixture_manifest::FixtureManifest;
use crate::fixture_sanitize::sanitize_payload_fragments;
use crate::seed_validator::SeedSchema;
use crate::{CaseSeed, Validate, compute_signature_hash};

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

/// Checks whether any seed in `seeds` contains sanitizable secret fragments.
///
/// Calls [`sanitize_payload_fragments`] on each seed payload and compares the
/// result to the original bytes. A warning is emitted whenever the sanitized
/// output differs, meaning the seed carries content that looks like credentials
/// or session material and must be scrubbed before public export.
///
/// # Actionable message
/// `"seed[{i}] id={id}: payload contains sanitizable secret fragments — \
///  run sanitize_seed_for_sharing before exporting"`
pub fn check_seed_sanitization(seeds: &[CaseSeed]) -> CompatReport {
    let mut warnings = Vec::new();
    for (i, seed) in seeds.iter().enumerate() {
        let sanitized = sanitize_payload_fragments(&seed.payload);
        if sanitized != seed.payload {
            warnings.push(CompatWarning {
                fixture_index: i,
                message: format!(
                    "seed[{}] id={}: payload contains sanitizable secret fragments \
                     — run sanitize_seed_for_sharing before exporting",
                    i, seed.id
                ),
            });
        }
    }
    CompatReport { warnings }
}

/// Checks whether a [`FixtureManifest`]'s recorded `engine_schema_version`
/// is within the set of versions this crate can load.
///
/// If the manifest was produced by an engine whose schema is no longer
/// supported, all fixtures it indexes should be re-exported using the current
/// engine before use in CI.
///
/// # Actionable message
/// `"manifest engine_schema_version {v} is not in supported bundle schemas \
///  {SUPPORTED_BUNDLE_SCHEMAS:?}; re-generate the manifest with the current engine"`
pub fn check_manifest_engine_schema(manifest: &FixtureManifest) -> CompatReport {
    let mut warnings = Vec::new();
    if !SUPPORTED_BUNDLE_SCHEMAS.contains(&manifest.engine_schema_version) {
        warnings.push(CompatWarning {
            fixture_index: 0,
            message: format!(
                "manifest engine_schema_version {} is not in supported bundle schemas {:?}; \
                 re-generate the manifest with the current engine",
                manifest.engine_schema_version, SUPPORTED_BUNDLE_SCHEMAS
            ),
        });
    }
    CompatReport { warnings }
}

/// Checks whether each bundle's stored `signature_hash` still matches the
/// value recomputed from the seed payload using [`compute_signature_hash`].
///
/// A mismatch means either the hashing algorithm changed since the fixture was
/// produced, or the fixture was modified after export. Either way the bundle
/// must be re-exported to restore triage confidence.
///
/// # Actionable message
/// `"bundle[{i}] seed id={id}: signature_hash mismatch (stored {stored:#x} ≠ \
///  computed {computed:#x}); re-export this bundle"`
pub fn check_bundle_signature_hashes(docs: &[CaseBundleDocument]) -> CompatReport {
    let mut warnings = Vec::new();
    for (i, doc) in docs.iter().enumerate() {
        let computed =
            compute_signature_hash(&doc.signature.category, &doc.seed.payload);
        if computed != doc.signature.signature_hash {
            warnings.push(CompatWarning {
                fixture_index: i,
                message: format!(
                    "bundle[{}] seed id={}: signature_hash mismatch \
                     (stored {:#x} \u{2260} computed {:#x}); re-export this bundle",
                    i, doc.seed.id, doc.signature.signature_hash, computed
                ),
            });
        }
    }
    CompatReport { warnings }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bundle_persist::CASE_BUNDLE_SCHEMA_VERSION;
    use crate::fixture_manifest::FixtureManifest;
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

    // ── check_seed_sanitization ───────────────────────────────────────────────

    #[test]
    fn clean_seed_passes_sanitization_check() {
        let seeds = vec![
            make_seed(1, 4),
            CaseSeed {
                id: 2,
                payload: b"mode=replay&input=abcd".to_vec(),
            },
        ];
        let report = check_seed_sanitization(&seeds);
        assert!(report.is_compatible(), "unexpected warnings: {:?}", report.warnings);
    }

    #[test]
    fn seed_with_secret_fragment_produces_sanitization_warning() {
        let seeds = vec![CaseSeed {
            id: 7,
            payload: b"user=demo&token=abcd1234&mode=replay".to_vec(),
        }];
        let report = check_seed_sanitization(&seeds);
        assert!(!report.is_compatible());
        assert_eq!(report.warnings.len(), 1);
        assert_eq!(report.warnings[0].fixture_index, 0);
        let msg = &report.warnings[0].message;
        assert!(msg.contains("seed[0]"), "missing index in: {msg}");
        assert!(msg.contains("id=7"), "missing id in: {msg}");
        assert!(
            msg.contains("sanitizable secret fragments"),
            "missing action hint in: {msg}"
        );
        assert!(
            msg.contains("sanitize_seed_for_sharing"),
            "missing remedy in: {msg}"
        );
    }

    #[test]
    fn empty_seed_set_sanitization_is_compatible() {
        let report = check_seed_sanitization(&[]);
        assert!(report.is_compatible());
    }

    // ── check_manifest_engine_schema ─────────────────────────────────────────

    #[test]
    fn current_manifest_engine_schema_is_compatible() {
        let manifest = FixtureManifest::new(CASE_BUNDLE_SCHEMA_VERSION);
        let report = check_manifest_engine_schema(&manifest);
        assert!(
            report.is_compatible(),
            "unexpected warnings: {:?}",
            report.warnings
        );
    }

    /// Edge case: a manifest produced by a hypothetical engine schema 0 (pre-v1)
    /// must be flagged as incompatible so the operator knows to re-generate it.
    #[test]
    fn legacy_manifest_engine_schema_produces_warning() {
        let manifest = FixtureManifest::new(0);
        let report = check_manifest_engine_schema(&manifest);
        assert!(!report.is_compatible());
        assert_eq!(report.warnings[0].fixture_index, 0);
        let msg = &report.warnings[0].message;
        assert!(msg.contains("engine_schema_version 0"), "got: {msg}");
        assert!(msg.contains("re-generate"), "missing remedy in: {msg}");
    }

    #[test]
    fn manifest_with_unsupported_schema_999_produces_warning() {
        let manifest = FixtureManifest::new(999);
        let report = check_manifest_engine_schema(&manifest);
        assert!(!report.is_compatible());
        assert!(report.warnings[0].message.contains("engine_schema_version 999"));
    }

    // ── check_bundle_signature_hashes ────────────────────────────────────────

    #[test]
    fn bundle_with_correct_signature_hash_is_compatible() {
        let bundle = to_bundle(make_seed(1, 4));
        let doc = make_doc(CASE_BUNDLE_SCHEMA_VERSION, bundle.seed.clone());
        // Patch the signature to match what compute_signature_hash would produce.
        let doc = CaseBundleDocument {
            signature: bundle.signature.clone(),
            ..doc
        };
        let report = check_bundle_signature_hashes(&[doc]);
        assert!(
            report.is_compatible(),
            "unexpected warnings: {:?}",
            report.warnings
        );
    }

    /// Edge case: manually flip the stored signature_hash to simulate a fixture
    /// that was tampered with or produced by an old hashing algorithm.
    #[test]
    fn bundle_with_tampered_signature_hash_produces_warning() {
        let bundle = to_bundle(make_seed(5, 4));
        let mut doc = CaseBundleDocument {
            schema: CASE_BUNDLE_SCHEMA_VERSION,
            seed: bundle.seed.clone(),
            signature: bundle.signature.clone(),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };
        // Corrupt the stored hash.
        doc.signature.signature_hash = doc.signature.signature_hash.wrapping_add(1);
        let report = check_bundle_signature_hashes(&[doc]);
        assert!(!report.is_compatible());
        assert_eq!(report.warnings[0].fixture_index, 0);
        let msg = &report.warnings[0].message;
        assert!(msg.contains("signature_hash mismatch"), "got: {msg}");
        assert!(msg.contains("re-export"), "missing remedy in: {msg}");
    }

    #[test]
    fn empty_bundle_set_signature_check_is_compatible() {
        let report = check_bundle_signature_hashes(&[]);
        assert!(report.is_compatible());
    }

    // ── composed check ────────────────────────────────────────────────────────

    /// Verifies that all five checker functions compose correctly on a mixed
    /// fixture set: clean items produce zero warnings, dirty items produce
    /// exactly the expected warnings.
    #[test]
    fn all_checks_compose_for_mixed_fixture_set() {
        // Seeds: one clean, one with a secret fragment.
        let seeds = vec![
            make_seed(1, 4),
            CaseSeed {
                id: 99,
                payload: b"api_key=s3cr3t".to_vec(),
            },
        ];
        let seed_compat = check_seed_fixtures(&seeds, &SeedSchema::default());
        let seed_sanit = check_seed_sanitization(&seeds);
        assert!(seed_compat.is_compatible()); // both seeds are within bounds
        assert!(!seed_sanit.is_compatible()); // seed[1] has a secret
        assert_eq!(seed_sanit.warnings.len(), 1);
        assert_eq!(seed_sanit.warnings[0].fixture_index, 1);

        // Manifest: current engine schema → compatible.
        let manifest = FixtureManifest::new(CASE_BUNDLE_SCHEMA_VERSION);
        let manifest_report = check_manifest_engine_schema(&manifest);
        assert!(manifest_report.is_compatible());

        // Bundles: one valid, one with tampered hash.
        let good = to_bundle(make_seed(2, 4));
        let good_doc = CaseBundleDocument {
            schema: CASE_BUNDLE_SCHEMA_VERSION,
            seed: good.seed.clone(),
            signature: good.signature.clone(),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };
        let mut bad_doc = good_doc.clone();
        bad_doc.signature.signature_hash = bad_doc.signature.signature_hash.wrapping_add(7);
        let hash_report = check_bundle_signature_hashes(&[good_doc, bad_doc]);
        assert!(!hash_report.is_compatible());
        assert_eq!(hash_report.warnings.len(), 1);
        assert_eq!(hash_report.warnings[0].fixture_index, 1);
    }
}
