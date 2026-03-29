//! Fixture manifest metadata storage for indexing and compatibility checks.
//!
//! Stores fixture metadata with schema versioning to enable efficient indexing,
//! compatibility validation, and manifest-level checks at load time.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// Current fixture manifest schema version.
pub const FIXTURE_MANIFEST_SCHEMA_VERSION: u32 = 1;

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
    pub name: Option<String>,
    /// Failure category for failure scenarios.
    pub failure_category: Option<String>,
    /// Checksum/hash for integrity validation.
    pub checksum: Option<String>,
    /// Creation timestamp (ISO 8601).
    pub created_at: Option<String>,
    /// Optional tags for categorization.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Additional key-value metadata.
    #[serde(default)]
    pub properties: HashMap<String, String>,
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
    pub created_at: Option<String>,
    /// Manifest-level metadata.
    #[serde(default)]
    pub metadata: HashMap<String, String>,
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
    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.schema != FIXTURE_MANIFEST_SCHEMA_VERSION {
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
            }
        }
    }
}
