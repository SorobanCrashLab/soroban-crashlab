use serde::{Deserialize, Serialize};
use std::fmt;

pub const RUN_METADATA_SCHEMA_VERSION: u32 = 1;
pub const SUPPORTED_METADATA_SCHEMAS: &[u32] = &[RUN_METADATA_SCHEMA_VERSION];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunMetadata {
    pub schema: u32,
    pub timeout_ms: u64,
    pub name: String,
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
        }
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
}
