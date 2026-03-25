//! Versioned JSON persistence for [`CaseBundle`](crate::CaseBundle).
//!
//! Failing cases are stored as portable UTF-8 JSON with a top-level **`schema`**
//! field so future formats can be decoded explicitly (see issue #9).

use crate::{CaseBundle, CaseSeed, CrashSignature, EnvironmentFingerprint};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{Read, Write};

/// Current on-disk schema version for [`save_case_bundle_json`] / [`load_case_bundle_json`].
pub const CASE_BUNDLE_SCHEMA_VERSION: u32 = 1;

/// Schema versions this crate can load.
pub const SUPPORTED_BUNDLE_SCHEMAS: &[u32] = &[CASE_BUNDLE_SCHEMA_VERSION];

/// Wire/document shape written to JSON. The `schema` field versions the layout.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaseBundleDocument {
    /// Format discriminator; bump when fields are added, removed, or re-interpreted.
    pub schema: u32,
    pub seed: CaseSeed,
    pub signature: CrashSignature,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<EnvironmentFingerprint>,
    /// Raw failure output (stderr, host error bytes, trace snippet, etc.).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub failure_payload: Vec<u8>,
}

/// Errors from loading or saving a bundle.
#[derive(Debug)]
pub enum BundlePersistError {
    /// `serde_json` encode/decode failure.
    Json(serde_json::Error),
    /// I/O when reading or writing bytes.
    Io(std::io::Error),
    /// Document `schema` is not in [`SUPPORTED_BUNDLE_SCHEMAS`].
    UnsupportedSchema { found: u32 },
}

impl fmt::Display for BundlePersistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BundlePersistError::Json(e) => write!(f, "bundle JSON error: {e}"),
            BundlePersistError::Io(e) => write!(f, "bundle I/O error: {e}"),
            BundlePersistError::UnsupportedSchema { found } => write!(
                f,
                "unsupported bundle schema version {found} (supported: {:?})",
                SUPPORTED_BUNDLE_SCHEMAS
            ),
        }
    }
}

impl std::error::Error for BundlePersistError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            BundlePersistError::Json(e) => Some(e),
            BundlePersistError::Io(e) => Some(e),
            BundlePersistError::UnsupportedSchema { .. } => None,
        }
    }
}

impl From<serde_json::Error> for BundlePersistError {
    fn from(e: serde_json::Error) -> Self {
        BundlePersistError::Json(e)
    }
}

impl From<std::io::Error> for BundlePersistError {
    fn from(e: std::io::Error) -> Self {
        BundlePersistError::Io(e)
    }
}

impl CaseBundleDocument {
    /// Builds a document from an in-memory bundle using the current schema version.
    pub fn from_bundle(bundle: &CaseBundle) -> Self {
        Self {
            schema: CASE_BUNDLE_SCHEMA_VERSION,
            seed: bundle.seed.clone(),
            signature: bundle.signature.clone(),
            environment: bundle.environment.clone(),
            failure_payload: bundle.failure_payload.clone(),
        }
    }

    /// Converts this document into a [`CaseBundle`] after validating `schema`.
    pub fn into_bundle(self) -> Result<CaseBundle, BundlePersistError> {
        if !SUPPORTED_BUNDLE_SCHEMAS.contains(&self.schema) {
            return Err(BundlePersistError::UnsupportedSchema {
                found: self.schema,
            });
        }
        Ok(CaseBundle {
            seed: self.seed,
            signature: self.signature,
            environment: self.environment,
            failure_payload: self.failure_payload,
        })
    }
}

/// Serializes `bundle` to pretty-printed JSON bytes (UTF-8) including `schema`.
pub fn save_case_bundle_json(bundle: &CaseBundle) -> Result<Vec<u8>, BundlePersistError> {
    let doc = CaseBundleDocument::from_bundle(bundle);
    Ok(serde_json::to_vec_pretty(&doc)?)
}

/// Parses JSON bytes into a [`CaseBundle`], validating `schema`.
pub fn load_case_bundle_json(bytes: &[u8]) -> Result<CaseBundle, BundlePersistError> {
    let doc: CaseBundleDocument = serde_json::from_slice(bytes)?;
    doc.into_bundle()
}

/// Writes JSON to any [`Write`] implementation.
pub fn write_case_bundle_json<W: Write>(bundle: &CaseBundle, writer: &mut W) -> Result<(), BundlePersistError> {
    let buf = save_case_bundle_json(bundle)?;
    writer.write_all(&buf)?;
    Ok(())
}

/// Reads JSON from any [`Read`] implementation.
pub fn read_case_bundle_json<R: Read>(reader: &mut R) -> Result<CaseBundle, BundlePersistError> {
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    load_case_bundle_json(&buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, to_bundle_with_environment, CrashSignature};

    #[test]
    fn roundtrip_preserves_seed_signature_and_environment() {
        let bundle = to_bundle_with_environment(crate::CaseSeed {
            id: 7,
            payload: vec![1, 2, 3, 4],
        });
        let bytes = save_case_bundle_json(&bundle).expect("serialize");
        let loaded = load_case_bundle_json(&bytes).expect("deserialize");
        assert_eq!(loaded.seed, bundle.seed);
        assert_eq!(loaded.signature, bundle.signature);
        assert_eq!(loaded.environment, bundle.environment);
        assert!(loaded.failure_payload.is_empty());
    }

    #[test]
    fn roundtrip_with_failure_payload() {
        let mut bundle = to_bundle(crate::CaseSeed {
            id: 99,
            payload: vec![0xAB, 0xCD],
        });
        bundle.failure_payload = b"panic: contract trap".to_vec();
        let bytes = save_case_bundle_json(&bundle).unwrap();
        let loaded = load_case_bundle_json(&bytes).unwrap();
        assert_eq!(loaded.failure_payload, b"panic: contract trap");
    }

    #[test]
    fn json_contains_schema_field() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 1,
            payload: vec![0],
        });
        let s = String::from_utf8(save_case_bundle_json(&bundle).unwrap()).unwrap();
        assert!(s.contains("\"schema\""));
        assert!(s.contains(&CASE_BUNDLE_SCHEMA_VERSION.to_string()));
    }

    #[test]
    fn unsupported_schema_rejected() {
        let doc = CaseBundleDocument {
            schema: 999,
            seed: crate::CaseSeed {
                id: 1,
                payload: vec![],
            },
            signature: CrashSignature {
                category: "empty-input".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: None,
            failure_payload: vec![],
        };
        let bytes = serde_json::to_vec(&doc).unwrap();
        let err = load_case_bundle_json(&bytes).unwrap_err();
        match err {
            BundlePersistError::UnsupportedSchema { found } => assert_eq!(found, 999),
            _ => panic!("expected UnsupportedSchema"),
        }
    }

    #[test]
    fn omits_optional_empty_fields_in_json() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 2,
            payload: vec![3],
        });
        let s = String::from_utf8(save_case_bundle_json(&bundle).unwrap()).unwrap();
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(v["schema"], CASE_BUNDLE_SCHEMA_VERSION);
        assert!(v.get("environment").is_none());
        assert!(v.get("failure_payload").is_none());
    }

    #[test]
    fn read_write_roundtrip_via_trait() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 3,
            payload: vec![9, 9],
        });
        let mut buf = Vec::new();
        write_case_bundle_json(&bundle, &mut buf).unwrap();
        let loaded = read_case_bundle_json(&mut buf.as_slice()).unwrap();
        assert_eq!(loaded, bundle);
    }
}
