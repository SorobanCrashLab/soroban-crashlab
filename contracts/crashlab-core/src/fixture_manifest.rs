//! Fixture manifest metadata storage for indexing and compatibility checks.
//!
//! Stores fixture metadata with schema versioning to enable efficient indexing,
//! compatibility validation, and manifest-level checks at load time.

use crate::provenance::{
    verify_optional, ProvenanceError, ProvenanceOutcome, ProvenancePolicy, ProvenanceRecord,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// Current fixture manifest schema version.
pub const FIXTURE_MANIFEST_SCHEMA_VERSION: u32 = 1;

/// Schema version of the shrink-lineage block (#1866).
pub const SHRINK_LINEAGE_SCHEMA_VERSION: u32 = 1;

/// Schema versions this crate can load.
///
/// Provenance (#1864) is an additive, optional block, so it does not bump the
/// manifest schema: a v1 manifest without provenance still loads.
pub const SUPPORTED_MANIFEST_SCHEMAS: &[u32] = &[FIXTURE_MANIFEST_SCHEMA_VERSION];

/// Metadata describing how a fixture was shrunk from its original capture to a
/// minimal reproducer (#1866).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShrinkLineage {
    /// Lineage schema version.
    pub schema: u32,
    /// Shrinker strategy name (e.g. `ddmin-payload`).
    pub strategy: String,
    /// Number of candidate evaluations the shrinker performed.
    pub iterations: u32,
    /// Payload size of the original capture, in bytes.
    pub original_bytes: usize,
    /// Payload size of the minimal reproduction, in bytes.
    pub minimal_bytes: usize,
    /// Bytes removed (`original_bytes - minimal_bytes`).
    pub removed_bytes: usize,
    /// Reproduction steps (seed operations) before shrinking.
    pub original_steps: u32,
    /// Seed operations needed to reproduce with the minimal payload.
    pub minimal_steps: u32,
    /// Fields the shrink strategy guarantees to preserve (e.g. `signature`).
    #[serde(default)]
    pub preserved_fields: Vec<String>,
}

impl ShrinkLineage {
    /// Builds a lineage block, deriving `removed_bytes`.
    pub fn new(
        strategy: impl Into<String>,
        iterations: u32,
        original_bytes: usize,
        minimal_bytes: usize,
        original_steps: u32,
        minimal_steps: u32,
    ) -> Self {
        Self {
            schema: SHRINK_LINEAGE_SCHEMA_VERSION,
            strategy: strategy.into(),
            iterations,
            original_bytes,
            minimal_bytes,
            removed_bytes: original_bytes.saturating_sub(minimal_bytes),
            original_steps,
            minimal_steps,
            preserved_fields: Vec::new(),
        }
    }

    /// Records that `field` is preserved by the shrink strategy.
    pub fn with_preserved_field(mut self, field: impl Into<String>) -> Self {
        let field = field.into();
        if !self.preserved_fields.contains(&field) {
            self.preserved_fields.push(field);
        }
        self
    }

    /// `removed_bytes / original_bytes` in `[0.0, 1.0]`; `1.0` for empty input.
    pub fn reduction_ratio(&self) -> f64 {
        if self.original_bytes == 0 {
            return 1.0;
        }
        self.removed_bytes as f64 / self.original_bytes as f64
    }

    /// Human-readable one-line delta for CLI / report output.
    pub fn render(&self) -> String {
        format!(
            "{}: {} -> {} bytes (-{}, {:.0}%), {} -> {} steps, preserved: [{}]",
            self.strategy,
            self.original_bytes,
            self.minimal_bytes,
            self.removed_bytes,
            self.reduction_ratio() * 100.0,
            self.original_steps,
            self.minimal_steps,
            self.preserved_fields.join(", ")
        )
    }
}

/// A shrunk fixture keeps both forms: the original capture and the minimal
/// reproduction, each content-hashed, plus the delta between them (#1866).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FixturePairing {
    /// SHA-256 of the original (pre-shrink) payload.
    pub original_content_hash: String,
    /// SHA-256 of the minimal reproduction payload.
    pub minimal_content_hash: String,
    /// Delta metadata describing the shrink.
    pub lineage: ShrinkLineage,
}

impl FixturePairing {
    /// Builds a pairing, content-hashing both payloads.
    pub fn new(
        original_payload: &[u8],
        minimal_payload: &[u8],
        lineage: ShrinkLineage,
    ) -> Self {
        Self {
            original_content_hash: crate::provenance::sha256_hex(original_payload),
            minimal_content_hash: crate::provenance::sha256_hex(minimal_payload),
            lineage,
        }
    }

    /// `true` when the minimal form actually differs from the original.
    pub fn is_reduced(&self) -> bool {
        self.original_content_hash != self.minimal_content_hash
    }
}

/// Metadata for a single fixture entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FixtureMetadata {
    /// Unique fixture identifier.
    pub id: String,
    /// Fixture type: 'seed', 'bundle', or 'corpus'.
    pub fixture_type: String,
    /// Schema version of the fixture payload.
    pub schema_version: u32,
    /// Human-readable name/description.
    #[serde(default)]
    pub name: Option<String>,
    /// Failure category for failure scenarios.
    #[serde(default)]
    pub failure_category: Option<String>,
    /// Checksum/hash for integrity validation.
    #[serde(default)]
    pub checksum: Option<String>,
    /// Creation timestamp (ISO 8601).
    #[serde(default)]
    pub created_at: Option<String>,
    /// Optional tags for categorization.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Additional key-value metadata.
    #[serde(default)]
    pub properties: HashMap<String, String>,
    /// Tamper-evident provenance linking seed → run → engine → environment (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceRecord>,
    /// Original + minimal payload pairing with shrink delta metadata (#1866).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pairing: Option<FixturePairing>,
}

/// Fixture manifest containing metadata for all fixtures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FixtureManifest {
    /// Manifest schema version for format evolution.
    pub schema: u32,
    /// Map of fixture ID to metadata.
    pub fixtures: HashMap<String, FixtureMetadata>,
    /// Engine schema version the fixtures target.
    pub engine_schema_version: u32,
    /// Creation timestamp (ISO 8601).
    #[serde(default)]
    pub created_at: Option<String>,
    /// Manifest-level metadata.
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Summary of a manifest-wide provenance verification pass (#1864).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProvenanceReport {
    /// Number of fixtures whose provenance verified successfully.
    pub verified: usize,
    /// Fixture ids with no provenance block (only non-empty under `WarnOnMissing`).
    pub missing: Vec<String>,
    /// Human-readable warnings collected during verification.
    pub warnings: Vec<String>,
}

impl ProvenanceReport {
    /// `true` when every fixture carried verifiable provenance.
    pub fn is_fully_verified(&self) -> bool {
        self.missing.is_empty()
    }
}

/// Error type for manifest operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    /// Fixture ID not found in manifest.
    FixtureNotFound(String),
    /// Fixture metadata validation failed.
    ValidationFailed(String),
    /// Schema version incompatibility.
    SchemaVersionMismatch { found: u32, expected: u32 },
    /// Duplicate fixture ID detected.
    DuplicateFixtureId(String),
    /// Provenance verification failed for a fixture.
    ProvenanceFailed { fixture_id: String, reason: String },
    /// Serialization/deserialization error.
    SerializationError(String),
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ManifestError::FixtureNotFound(id) => write!(f, "fixture not found: {id}"),
            ManifestError::ValidationFailed(msg) => write!(f, "validation failed: {msg}"),
            ManifestError::SchemaVersionMismatch { found, expected } => write!(
                f,
                "schema version mismatch: found {found}, expected {expected}"
            ),
            ManifestError::DuplicateFixtureId(id) => write!(f, "duplicate fixture id: {id}"),
            ManifestError::ProvenanceFailed { fixture_id, reason } => {
                write!(f, "provenance verification failed for {fixture_id}: {reason}")
            }
            ManifestError::SerializationError(msg) => write!(f, "serialization error: {msg}"),
        }
    }
}

impl std::error::Error for ManifestError {}

impl FixtureMetadata {
    /// Creates a new fixture metadata entry.
    pub fn new(id: impl Into<String>, fixture_type: impl Into<String>, schema_version: u32) -> Self {
        Self {
            id: id.into(),
            fixture_type: fixture_type.into(),
            schema_version,
            name: None,
            failure_category: None,
            checksum: None,
            created_at: None,
            tags: Vec::new(),
            properties: HashMap::new(),
            provenance: None,
            pairing: None,
        }
    }

    /// Sets the fixture name.
    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Sets the failure category.
    pub fn with_failure_category(mut self, category: impl Into<String>) -> Self {
        self.failure_category = Some(category.into());
        self
    }

    /// Sets the checksum.
    pub fn with_checksum(mut self, checksum: impl Into<String>) -> Self {
        self.checksum = Some(checksum.into());
        self
    }

    /// Adds a tag to the fixture.
    pub fn add_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Adds a property to the fixture.
    pub fn add_property(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.properties.insert(key.into(), value.into());
        self
    }

    /// Attaches a tamper-evident provenance record (#1864).
    pub fn with_provenance(mut self, provenance: ProvenanceRecord) -> Self {
        self.provenance = Some(provenance);
        self
    }

    /// Verifies this fixture's provenance under `policy`.
    ///
    /// Returns [`ManifestError::ProvenanceFailed`] on a tampered block or a
    /// missing block under [`ProvenancePolicy::Require`].
    pub fn verify_provenance(
        &self,
        policy: ProvenancePolicy,
    ) -> Result<ProvenanceOutcome, ManifestError> {
        verify_optional(self.provenance.as_ref(), policy).map_err(|e| {
            ManifestError::ProvenanceFailed {
                fixture_id: self.id.clone(),
                reason: e.to_string(),
            }
        })
    }

    /// Attaches original+minimal payload pairing with shrink delta metadata (#1866).
    pub fn with_pairing(mut self, pairing: FixturePairing) -> Self {
        self.pairing = Some(pairing);
        self
    }

    /// `true` when this is a legacy single-payload fixture (no shrink pairing).
    pub fn is_original_only(&self) -> bool {
        self.pairing.is_none()
    }

    /// The shrink lineage, if the fixture is paired (#1866).
    pub fn shrink_lineage(&self) -> Option<&ShrinkLineage> {
        self.pairing.as_ref().map(|p| &p.lineage)
    }

    /// Validates fixture metadata against basic constraints.
    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.id.is_empty() {
            return Err(ManifestError::ValidationFailed(
                "fixture id cannot be empty".to_string(),
            ));
        }
        if self.fixture_type.is_empty() {
            return Err(ManifestError::ValidationFailed(
                "fixture_type cannot be empty".to_string(),
            ));
        }
        if !["seed", "bundle", "corpus"].contains(&self.fixture_type.as_str()) {
            return Err(ManifestError::ValidationFailed(format!(
                "invalid fixture_type: {} (must be 'seed', 'bundle', or 'corpus')",
                self.fixture_type
            )));
        }
        Ok(())
    }
}

impl FixtureManifest {
    /// Creates a new empty fixture manifest.
    pub fn new(engine_schema_version: u32) -> Self {
        Self {
            schema: FIXTURE_MANIFEST_SCHEMA_VERSION,
            fixtures: HashMap::new(),
            engine_schema_version,
            created_at: None,
            metadata: HashMap::new(),
        }
    }

    /// Adds a fixture metadata entry to the manifest.
    pub fn add_fixture(&mut self, metadata: FixtureMetadata) -> Result<(), ManifestError> {
        metadata.validate()?;
        if self.fixtures.contains_key(&metadata.id) {
            return Err(ManifestError::DuplicateFixtureId(metadata.id));
        }
        self.fixtures.insert(metadata.id.clone(), metadata);
        Ok(())
    }

    /// Retrieves fixture metadata by ID.
    pub fn get_fixture(&self, id: &str) -> Result<&FixtureMetadata, ManifestError> {
        self.fixtures
            .get(id)
            .ok_or_else(|| ManifestError::FixtureNotFound(id.to_string()))
    }

    /// Validates manifest at load time.
    ///
    /// Provenance is *not* verified here; use [`FixtureManifest::verify_all_provenance`]
    /// with an explicit [`ProvenancePolicy`].
    pub fn validate(&self) -> Result<(), ManifestError> {
        if !SUPPORTED_MANIFEST_SCHEMAS.contains(&self.schema) {
            return Err(ManifestError::SchemaVersionMismatch {
                found: self.schema,
                expected: FIXTURE_MANIFEST_SCHEMA_VERSION,
            });
        }

        // Validate all entries
        for (id, metadata) in &self.fixtures {
            metadata.validate()?;
            if id != &metadata.id {
                return Err(ManifestError::ValidationFailed(format!(
                    "key {} does not match fixture id {}",
                    id, metadata.id
                )));
            }
        }

        Ok(())
    }

    /// Verifies provenance for every fixture under `policy` (#1864).
    ///
    /// A tampered block, or a missing block under [`ProvenancePolicy::Require`],
    /// is a hard error — the caller must quarantine rather than execute the
    /// fixture. Under [`ProvenancePolicy::WarnOnMissing`] missing blocks are
    /// collected in [`ProvenanceReport::missing`] and returned as warnings.
    pub fn verify_all_provenance(
        &self,
        policy: ProvenancePolicy,
    ) -> Result<ProvenanceReport, ManifestError> {
        let mut report = ProvenanceReport::default();
        let mut ids: Vec<&String> = self.fixtures.keys().collect();
        ids.sort();
        for id in ids {
            let metadata = &self.fixtures[id];
            let outcome = metadata.verify_provenance(policy)?;
            if outcome.missing {
                report.missing.push(id.clone());
            } else {
                report.verified += 1;
            }
            report.warnings.extend(outcome.warnings);
        }
        Ok(report)
    }

    /// Filters fixtures by type.
    pub fn by_type(&self, fixture_type: &str) -> Vec<&FixtureMetadata> {
        self.fixtures
            .values()
            .filter(|m| m.fixture_type == fixture_type)
            .collect()
    }

    /// Filters fixtures by tag.
    pub fn by_tag(&self, tag: &str) -> Vec<&FixtureMetadata> {
        self.fixtures
            .values()
            .filter(|m| m.tags.contains(&tag.to_string()))
            .collect()
    }

    /// Filters fixtures by failure category.
    pub fn by_failure_category(&self, category: &str) -> Vec<&FixtureMetadata> {
        self.fixtures
            .values()
            .filter(|m| m.failure_category.as_ref().map_or(false, |c| c == category))
            .collect()
    }

    /// Fixtures that carry a shrink pairing (#1866).
    pub fn paired(&self) -> Vec<&FixtureMetadata> {
        self.fixtures.values().filter(|m| m.pairing.is_some()).collect()
    }

    /// Legacy fixtures that carry no shrink pairing (#1866).
    pub fn original_only(&self) -> Vec<&FixtureMetadata> {
        self.fixtures.values().filter(|m| m.pairing.is_none()).collect()
    }

    /// Serializes manifest to JSON.
    pub fn to_json(&self) -> Result<String, ManifestError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| ManifestError::SerializationError(e.to_string()))
    }

    /// Deserializes manifest from JSON.
    pub fn from_json(json: &str) -> Result<Self, ManifestError> {
        let manifest: FixtureManifest = serde_json::from_str(json)
            .map_err(|e| ManifestError::SerializationError(e.to_string()))?;
        manifest.validate()?;
        Ok(manifest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixture_metadata_creation() {
        let meta = FixtureMetadata::new("fix-001", "seed", 1)
            .with_name("Test Fixture")
            .with_failure_category("Panic")
            .add_tag("critical")
            .add_property("source", "fuzzer");

        assert_eq!(meta.id, "fix-001");
        assert_eq!(meta.fixture_type, "seed");
        assert_eq!(meta.schema_version, 1);
        assert_eq!(meta.name, Some("Test Fixture".to_string()));
        assert_eq!(meta.failure_category, Some("Panic".to_string()));
        assert!(meta.tags.contains(&"critical".to_string()));
        assert_eq!(meta.properties.get("source"), Some(&"fuzzer".to_string()));
    }

    #[test]
    fn test_fixture_metadata_validation() {
        let valid = FixtureMetadata::new("fix-001", "seed", 1);
        assert!(valid.validate().is_ok());

        let invalid_type =
            FixtureMetadata::new("fix-001", "invalid_type", 1);
        assert!(invalid_type.validate().is_err());

        let empty_id = FixtureMetadata {
            id: String::new(),
            fixture_type: "seed".to_string(),
            schema_version: 1,
            ..Default::default()
        };
        assert!(empty_id.validate().is_err());
    }

    #[test]
    fn test_manifest_add_fixture() {
        let mut manifest = FixtureManifest::new(1);
        let meta = FixtureMetadata::new("fix-001", "seed", 1);
        assert!(manifest.add_fixture(meta).is_ok());
        assert_eq!(manifest.fixtures.len(), 1);
    }

    #[test]
    fn test_manifest_duplicate_prevention() {
        let mut manifest = FixtureManifest::new(1);
        let meta1 = FixtureMetadata::new("fix-001", "seed", 1);
        let meta2 = FixtureMetadata::new("fix-001", "bundle", 1);
        
        assert!(manifest.add_fixture(meta1).is_ok());
        assert!(manifest.add_fixture(meta2).is_err());
    }

    #[test]
    fn test_manifest_serialization() {
        let mut manifest = FixtureManifest::new(1);
        let meta = FixtureMetadata::new("fix-001", "seed", 1)
            .with_name("Test");
        manifest.add_fixture(meta).unwrap();

        let json = manifest.to_json().unwrap();
        let restored = FixtureManifest::from_json(&json).unwrap();
        
        assert_eq!(manifest.fixtures.len(), restored.fixtures.len());
        assert_eq!(restored.get_fixture("fix-001").unwrap().name, Some("Test".to_string()));
    }

    #[test]
    fn test_manifest_filtering() {
        let mut manifest = FixtureManifest::new(1);
        let meta1 = FixtureMetadata::new("fix-001", "seed", 1)
            .add_tag("critical");
        let meta2 = FixtureMetadata::new("fix-002", "bundle", 1)
            .add_tag("regression");
        
        manifest.add_fixture(meta1).unwrap();
        manifest.add_fixture(meta2).unwrap();

        assert_eq!(manifest.by_type("seed").len(), 1);
        assert_eq!(manifest.by_type("bundle").len(), 1);
        assert_eq!(manifest.by_tag("critical").len(), 1);
        assert_eq!(manifest.by_tag("regression").len(), 1);
    }

    // ── provenance (#1864) ────────────────────────────────────────────────────

    fn provenance_record(seed: &str) -> ProvenanceRecord {
        ProvenanceRecord::new(
            "run-1",
            seed.len() as u64,
            "0.1.0",
            crate::provenance::sha256_hex(b"linux/x86_64/unix"),
            "2026-01-01T00:00:00Z",
            "runtime-failure/0000000000000001/0000000000000002",
        )
        .seal()
    }

    #[test]
    fn provenance_round_trips_through_manifest_json() {
        let mut manifest = FixtureManifest::new(1);
        manifest
            .add_fixture(FixtureMetadata::new("fix-001", "seed", 1).with_provenance(provenance_record("fix")))
            .unwrap();

        let json = manifest.to_json().unwrap();
        assert!(json.contains("content_hash"));
        let restored = FixtureManifest::from_json(&json).unwrap();
        let rec = restored.get_fixture("fix-001").unwrap().provenance.as_ref().unwrap();
        rec.verify().unwrap();
    }

    #[test]
    fn legacy_manifest_without_provenance_loads() {
        let json = r#"{
            "schema": 1,
            "fixtures": {
                "fix-001": {"id": "fix-001", "fixture_type": "seed", "schema_version": 1}
            },
            "engine_schema_version": 1
        }"#;
        let manifest = FixtureManifest::from_json(json).unwrap();
        assert!(manifest.get_fixture("fix-001").unwrap().provenance.is_none());
    }

    #[test]
    fn verify_all_flags_missing_under_warn() {
        let mut manifest = FixtureManifest::new(1);
        manifest
            .add_fixture(FixtureMetadata::new("with", "seed", 1).with_provenance(provenance_record("with")))
            .unwrap();
        manifest.add_fixture(FixtureMetadata::new("without", "seed", 1)).unwrap();

        let report = manifest
            .verify_all_provenance(ProvenancePolicy::WarnOnMissing)
            .unwrap();
        assert_eq!(report.verified, 1);
        assert_eq!(report.missing, vec!["without".to_string()]);
        assert!(!report.is_fully_verified());
    }

    #[test]
    fn verify_all_rejects_missing_under_require() {
        let mut manifest = FixtureManifest::new(1);
        manifest.add_fixture(FixtureMetadata::new("without", "seed", 1)).unwrap();
        match manifest.verify_all_provenance(ProvenancePolicy::Require) {
            Err(ManifestError::ProvenanceFailed { fixture_id, .. }) => {
                assert_eq!(fixture_id, "without")
            }
            other => panic!("expected ProvenanceFailed, got {other:?}"),
        }
    }

    #[test]
    fn verify_all_detects_tampered_provenance() {
        let mut manifest = FixtureManifest::new(1);
        let mut rec = provenance_record("tampered");
        rec.seed_id = 999; // tamper after sealing
        manifest
            .add_fixture(FixtureMetadata::new("tampered", "seed", 1).with_provenance(rec))
            .unwrap();
        assert!(manifest
            .verify_all_provenance(ProvenancePolicy::WarnOnMissing)
            .is_err());
    }

    // ── shrink lineage (#1866) ────────────────────────────────────────────────

    fn lineage() -> ShrinkLineage {
        ShrinkLineage::new("delta-debug", 12, 512, 8, 9, 2)
            .with_preserved_field("signature")
            .with_preserved_field("payload")
    }

    #[test]
    fn shrink_lineage_derives_removed_bytes_and_ratio() {
        let lineage = ShrinkLineage::new("delta-debug", 3, 100, 25, 10, 4);
        assert_eq!(lineage.removed_bytes, 75);
        assert!((lineage.reduction_ratio() - 0.75).abs() < f64::EPSILON);
        assert!(lineage.render().contains("100 -> 25 bytes"));
    }

    #[test]
    fn pairing_hashes_both_payloads() {
        let lineage = ShrinkLineage::new("ddmin", 3, 4, 2, 4, 2);
        let pairing = FixturePairing::new(&[1, 2, 3, 4], &[1, 2], lineage);
        assert!(pairing.is_reduced());
        assert_ne!(pairing.original_content_hash, pairing.minimal_content_hash);
    }

    #[test]
    fn pairing_round_trips_through_manifest_json() {
        let mut manifest = FixtureManifest::new(1);
        let pairing = FixturePairing::new(
            &[9, 9, 9, 0xAA, 0xBB, 9],
            &[0xAA, 0xBB],
            ShrinkLineage::new("ddmin", 7, 6, 2, 6, 2).with_preserved_field("signature"),
        );
        manifest
            .add_fixture(FixtureMetadata::new("paired", "seed", 1).with_pairing(pairing.clone()))
            .unwrap();

        let restored = FixtureManifest::from_json(&manifest.to_json().unwrap()).unwrap();
        let got = restored.get_fixture("paired").unwrap();
        assert_eq!(got.pairing.as_ref(), Some(&pairing));
        assert_eq!(
            got.shrink_lineage().unwrap().preserved_fields,
            vec!["signature".to_string()]
        );
    }

    #[test]
    fn legacy_fixture_loads_as_original_only() {
        let mut manifest = FixtureManifest::new(1);
        manifest.add_fixture(FixtureMetadata::new("legacy", "seed", 1)).unwrap();
        manifest
            .add_fixture(FixtureMetadata::new("paired", "seed", 1).with_pairing(
                FixturePairing::new(&[1, 2], &[1], ShrinkLineage::new("ddmin", 1, 2, 1, 2, 1)),
            ))
            .unwrap();

        assert!(manifest.get_fixture("legacy").unwrap().is_original_only());
        assert!(manifest.get_fixture("legacy").unwrap().shrink_lineage().is_none());
        assert_eq!(manifest.paired().len(), 1);
        assert_eq!(manifest.original_only().len(), 1);
    }

    impl Default for FixtureMetadata {
        fn default() -> Self {
            Self {
                id: String::new(),
                fixture_type: String::new(),
                schema_version: 1,
                name: None,
                failure_category: None,
                checksum: None,
                created_at: None,
                tags: Vec::new(),
                properties: HashMap::new(),
                provenance: None,
                pairing: None,
            }
        }
    }
}
