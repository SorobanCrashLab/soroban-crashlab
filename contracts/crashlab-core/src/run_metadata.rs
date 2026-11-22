use serde::{Deserialize, Serialize};
use std::fmt;

pub const RUN_METADATA_SCHEMA_VERSION: u32 = 1;
pub const SUPPORTED_METADATA_SCHEMAS: &[u32] = &[RUN_METADATA_SCHEMA_VERSION];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunMetadata {
    pub schema: u32,
    pub timeout_ms: u64,
    pub name: String,
    /// Campaign / run identifier for provenance linking (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    /// Engine (crate) version that produced the run (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    /// Hex-encoded hash of the run's environment fingerprint (#1864, W5-B08).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_fingerprint_hash: Option<String>,
}

#[derive(Debug)]
pub enum MetadataPersistError {
    Json(serde_json::Error),
    UnsupportedSchema { found: u32 },
}

impl fmt::Display for MetadataPersistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MetadataPersistError::Json(e) => write!(f, "metadata JSON error: {e}"),
            MetadataPersistError::UnsupportedSchema { found } => write!(
                f,
                "unsupported metadata schema version {found} (supported: {:?})",
                SUPPORTED_METADATA_SCHEMAS
            ),
        }
    }
}

impl std::error::Error for MetadataPersistError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            MetadataPersistError::Json(e) => Some(e),
            MetadataPersistError::UnsupportedSchema { .. } => None,
        }
    }
}

impl From<serde_json::Error> for MetadataPersistError {
    fn from(e: serde_json::Error) -> Self {
        MetadataPersistError::Json(e)
    }
}

impl RunMetadata {
    pub fn new(name: String, timeout_ms: u64) -> Self {
        Self {
            schema: RUN_METADATA_SCHEMA_VERSION,
            timeout_ms,
            name,
            run_id: None,
            engine_version: Some(crate::engine_version::ENGINE_VERSION.to_string()),
            environment_fingerprint_hash: None,
        }
    }

    /// Sets the provenance identifiers carried by this run (#1864).
    pub fn with_provenance_refs(
        mut self,
        run_id: impl Into<String>,
        engine_version: impl Into<String>,
        environment_fingerprint_hash: impl Into<String>,
    ) -> Self {
        self.run_id = Some(run_id.into());
        self.engine_version = Some(engine_version.into());
        self.environment_fingerprint_hash = Some(environment_fingerprint_hash.into());
        self
    }

    pub fn load_json(bytes: &[u8]) -> Result<Self, MetadataPersistError> {
        let doc: serde_json::Value = serde_json::from_slice(bytes)?;
        let schema = doc
            .get("schema")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(0);

        if !SUPPORTED_METADATA_SCHEMAS.contains(&schema) {
            return Err(MetadataPersistError::UnsupportedSchema { found: schema });
        }

        let metadata: RunMetadata = serde_json::from_value(doc)?;
        Ok(metadata)
    }

    pub fn save_json(&self) -> Result<Vec<u8>, MetadataPersistError> {
        Ok(serde_json::to_vec_pretty(self)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_valid_metadata() {
        let meta = RunMetadata::new("test-run".to_string(), 5000);
        let bytes = meta.save_json().unwrap();
        let loaded = RunMetadata::load_json(&bytes).unwrap();
        assert_eq!(loaded.schema, RUN_METADATA_SCHEMA_VERSION);
        assert_eq!(loaded.timeout_ms, 5000);
    }

    #[test]
    fn rejects_unsupported_schema() {
        let json = r#"{"schema": 999, "timeout_ms": 1000, "name": "bad"}"#;
        let err = RunMetadata::load_json(json.as_bytes()).unwrap_err();
        match err {
            MetadataPersistError::UnsupportedSchema { found } => assert_eq!(found, 999),
            _ => panic!("Expected unsupported schema error"),
        }
    }

    #[test]
    fn legacy_metadata_without_provenance_refs_loads() {
        let json = r#"{"schema": 1, "timeout_ms": 1000, "name": "legacy"}"#;
        let meta = RunMetadata::load_json(json.as_bytes()).unwrap();
        assert!(meta.run_id.is_none());
        assert!(meta.engine_version.is_none());
        assert!(meta.environment_fingerprint_hash.is_none());
    }

    #[test]
    fn provenance_refs_round_trip() {
        let meta = RunMetadata::new("run".to_string(), 1000).with_provenance_refs(
            "run-42",
            "0.1.0",
            "deadbeef",
        );
        let bytes = meta.save_json().unwrap();
        let loaded = RunMetadata::load_json(&bytes).unwrap();
        assert_eq!(loaded.run_id.as_deref(), Some("run-42"));
        assert_eq!(loaded.engine_version.as_deref(), Some("0.1.0"));
        assert_eq!(loaded.environment_fingerprint_hash.as_deref(), Some("deadbeef"));
    }
}
