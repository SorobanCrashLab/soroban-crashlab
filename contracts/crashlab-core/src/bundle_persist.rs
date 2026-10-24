//! Versioned JSON persistence for [`CaseBundle`](crate::CaseBundle).
//!
//! Failing cases are stored as portable UTF-8 JSON with a top-level **`schema`**
//! field so future formats can be decoded explicitly (see issue #9).

use crate::fixture_manifest::ShrinkLineage;
use crate::provenance::ProvenanceRecord;
use crate::sequence::{SequenceRun, SequenceSeed, StepOutcome, SUPPORTED_SEQUENCE_SCHEMAS};
use crate::{CaseBundle, CaseSeed, CrashSignature, EnvironmentFingerprint, RpcEnvelopeCapture};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{Read, Write};

/// Current on-disk schema version for [`save_case_bundle_json`] / [`load_case_bundle_json`].
pub const CASE_BUNDLE_SCHEMA_VERSION: u32 = 2;
/// Maximum JSON bytes accepted from or written to bundle persistence.
pub const MAX_BUNDLE_JSON_BYTES: usize = 64 * 1024 * 1024;

/// Schema versions this crate can load.
pub const SUPPORTED_BUNDLE_SCHEMAS: &[u32] = &[1, CASE_BUNDLE_SCHEMA_VERSION];

/// Artifact class used by lease-based retention policies.
pub const BUNDLE_ARTIFACT_CLASS: &str = "bundle";

/// Current on-disk schema version for [`SequenceBundleDocument`].
pub const SEQUENCE_BUNDLE_SCHEMA_VERSION: u32 = 1;

/// Sequence-bundle schema versions this crate can load.
pub const SUPPORTED_SEQUENCE_BUNDLE_SCHEMAS: &[u32] = &[1, SEQUENCE_BUNDLE_SCHEMA_VERSION];

/// Artifact class for retained chain failures (#1858).
pub const SEQUENCE_BUNDLE_ARTIFACT_CLASS: &str = "sequence-bundle";

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
    /// Captured RPC request/response envelopes for reproducibility auditing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rpc_envelope: Option<RpcEnvelopeCapture>,
    /// Tamper-evident provenance preserved across export/import (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceRecord>,
    /// Original (pre-shrink) seed kept alongside the minimal `seed` (#1866).
    ///
    /// Absent on legacy single-payload documents: then `seed` *is* the original.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_seed: Option<CaseSeed>,
    /// Shrink delta metadata linking `original_seed` to `seed` (#1866).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shrink_lineage: Option<ShrinkLineage>,
    /// Mutation engine version that produced this bundle (#1794).
    #[serde(default)]
    pub engine_version: String,
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
    /// Provenance verification failed (#1864).
    Provenance(String),
    /// A sequence (multi-step chain) inside a document is invalid (#1858).
    Sequence(String),
    /// Artifact input or output exceeded a configured safety limit.
    SizeLimit { limit: usize },
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
            BundlePersistError::Provenance(msg) => write!(f, "bundle provenance error: {msg}"),
            BundlePersistError::Sequence(msg) => write!(f, "sequence bundle error: {msg}"),
            BundlePersistError::SizeLimit { limit } => {
                write!(f, "bundle exceeds the configured {limit}-byte size limit")
            }
        }
    }
}

impl std::error::Error for BundlePersistError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            BundlePersistError::Json(e) => Some(e),
            BundlePersistError::Io(e) => Some(e),
            BundlePersistError::UnsupportedSchema { .. } => None,
            BundlePersistError::Provenance(_) => None,
            BundlePersistError::Sequence(_) => None,
            BundlePersistError::SizeLimit { .. } => None,
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
        let engine_version = if bundle.engine_version.is_empty() {
            crate::engine_version::ENGINE_VERSION.to_string()
        } else {
            bundle.engine_version.clone()
        };
        Self {
            schema: CASE_BUNDLE_SCHEMA_VERSION,
            seed: bundle.seed.clone(),
            signature: bundle.signature.clone(),
            environment: bundle.environment.clone(),
            failure_payload: bundle.failure_payload.clone(),
            rpc_envelope: bundle.rpc_envelope.clone(),
            provenance: None,
            original_seed: None,
            shrink_lineage: None,
            engine_version,
        }
    }

    /// Attaches a provenance block, preserving it across export/import (#1864).
    pub fn with_provenance(mut self, provenance: ProvenanceRecord) -> Self {
        self.provenance = Some(provenance);
        self
    }

    /// Attaches the original (pre-shrink) seed and its shrink lineage (#1866).
    ///
    /// The document's `seed` remains the minimal reproduction.
    pub fn with_pairing(mut self, original_seed: CaseSeed, lineage: ShrinkLineage) -> Self {
        self.original_seed = Some(original_seed);
        self.shrink_lineage = Some(lineage);
        self
    }

    /// `true` when this document carries a shrink pairing.
    ///
    /// A legacy document (no `original_seed`) is *original-only*: its `seed` is
    /// the original and there is no minimal form.
    pub fn is_paired(&self) -> bool {
        self.original_seed.is_some()
    }

    /// Retention artifact class for this document.
    ///
    /// Bundles are retained under the `bundle` class; lease-based sweeps use
    /// this to apply per-class TTL and pin policies.
    pub fn artifact_class(&self) -> &'static str {
        BUNDLE_ARTIFACT_CLASS
    }

    /// The original (pre-shrink) seed, falling back to `seed` for legacy docs (#1866).
    pub fn original_or_minimal_seed(&self) -> &CaseSeed {
        self.original_seed.as_ref().unwrap_or(&self.seed)
    }

    /// Verifies the attached provenance (if any) under `policy` (#1864).
    pub fn verify_provenance(
        &self,
        policy: crate::provenance::ProvenancePolicy,
    ) -> Result<crate::provenance::ProvenanceOutcome, BundlePersistError> {
        crate::provenance::verify_optional(self.provenance.as_ref(), policy)
            .map_err(|e| BundlePersistError::Provenance(e.to_string()))
    }

    /// Converts this document into a [`CaseBundle`] after validating `schema`.
    pub fn into_bundle(self) -> Result<CaseBundle, BundlePersistError> {
        if !SUPPORTED_BUNDLE_SCHEMAS.contains(&self.schema) {
            return Err(BundlePersistError::UnsupportedSchema { found: self.schema });
        }
        let engine_version = if self.engine_version.is_empty() {
            "unknown".to_string()
        } else {
            self.engine_version
        };
        Ok(CaseBundle {
            seed: self.seed,
            signature: self.signature,
            environment: self.environment,
            failure_payload: self.failure_payload,
            rpc_envelope: self.rpc_envelope,
            engine_version,
        })
    }
}

/// Serializes `bundle` to pretty-printed JSON bytes (UTF-8) including `schema`.
///
/// This preserves the raw fixture contents. For public sharing, prefer
/// [`crate::save_sanitized_case_bundle_json`] to scrub secret-like fragments from
/// the seed and failure payloads before export.
pub fn save_case_bundle_json(bundle: &CaseBundle) -> Result<Vec<u8>, BundlePersistError> {
    let doc = CaseBundleDocument::from_bundle(bundle);
    serialize_bounded(&doc)
}

fn serialize_bounded<T: Serialize>(value: &T) -> Result<Vec<u8>, BundlePersistError> {
    let bytes = serde_json::to_vec_pretty(value)?;
    if bytes.len() > MAX_BUNDLE_JSON_BYTES {
        return Err(BundlePersistError::SizeLimit {
            limit: MAX_BUNDLE_JSON_BYTES,
        });
    }
    Ok(bytes)
}

/// Parses JSON bytes into a [`CaseBundle`], validating `schema`.
pub fn load_case_bundle_json(bytes: &[u8]) -> Result<CaseBundle, BundlePersistError> {
    if bytes.len() > MAX_BUNDLE_JSON_BYTES {
        return Err(BundlePersistError::SizeLimit {
            limit: MAX_BUNDLE_JSON_BYTES,
        });
    }
    let doc: CaseBundleDocument = serde_json::from_slice(bytes)?;
    doc.into_bundle()
}

/// Returns the retention artifact class for a serialized bundle document.
///
/// Used by the lease-based retention sweeper to select the per-class policy
/// (TTL, min-count floor, pin list) when planning deletions.
pub fn bundle_artifact_class() -> &'static str {
    BUNDLE_ARTIFACT_CLASS
}

/// Serializes a [`CaseBundleDocument`] as-is (preserving provenance, #1864).
pub fn save_case_bundle_document_json(
    doc: &CaseBundleDocument,
) -> Result<Vec<u8>, BundlePersistError> {
    serialize_bounded(doc)
}

/// Parses JSON bytes into a [`CaseBundleDocument`], validating `schema`.
///
/// Unlike [`load_case_bundle_json`] this keeps the provenance block and any
/// shrink pairing intact for callers that need the full document (#1864).
pub fn load_case_bundle_document_json(
    bytes: &[u8],
) -> Result<CaseBundleDocument, BundlePersistError> {
    if bytes.len() > MAX_BUNDLE_JSON_BYTES {
        return Err(BundlePersistError::SizeLimit {
            limit: MAX_BUNDLE_JSON_BYTES,
        });
    }
    let doc: CaseBundleDocument = serde_json::from_slice(bytes)?;
    if !SUPPORTED_BUNDLE_SCHEMAS.contains(&doc.schema) {
        return Err(BundlePersistError::UnsupportedSchema { found: doc.schema });
    }
    Ok(doc)
}

/// Writes JSON to any [`Write`] implementation.
pub fn write_case_bundle_json<W: Write>(
    bundle: &CaseBundle,
    writer: &mut W,
) -> Result<(), BundlePersistError> {
    let buf = save_case_bundle_json(bundle)?;
    writer.write_all(&buf)?;
    Ok(())
}

/// Reads JSON from any [`Read`] implementation.
pub fn read_case_bundle_json<R: Read>(reader: &mut R) -> Result<CaseBundle, BundlePersistError> {
    let mut buf = Vec::new();
    reader
        .take(MAX_BUNDLE_JSON_BYTES as u64 + 1)
        .read_to_end(&mut buf)?;
    if buf.len() > MAX_BUNDLE_JSON_BYTES {
        return Err(BundlePersistError::SizeLimit {
            limit: MAX_BUNDLE_JSON_BYTES,
        });
    }
    load_case_bundle_json(&buf)
}

/// A failure bundle that stores the **full chain** plus per-step diagnostics (#1858).
///
/// The inner [`CaseBundleDocument`] keeps the divergent step's usual evidence
/// (signature, environment, provenance), while `sequence` preserves every
/// invocation that had to run — in order — to reach it, and `observations`
/// records what each step actually did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequenceBundleDocument {
    /// Format discriminator for this wrapper.
    pub schema: u32,
    /// The full multi-step chain (seed schema v2).
    pub sequence: SequenceSeed,
    /// Bundle evidence for the failing step (W5-A09 per-step context).
    pub bundle: CaseBundleDocument,
    /// One observed outcome per step, in execution order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub observations: Vec<StepOutcome>,
    /// Index of the first divergent step, when the chain produced one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub divergence_step: Option<usize>,
}

impl SequenceBundleDocument {
    /// Builds a chain failure document from an executed run (#1858).
    pub fn from_run(
        sequence: &SequenceSeed,
        run: &SequenceRun,
        bundle: CaseBundleDocument,
    ) -> Self {
        Self {
            schema: SEQUENCE_BUNDLE_SCHEMA_VERSION,
            sequence: sequence.clone(),
            bundle,
            observations: run.observations.clone(),
            divergence_step: run.verdict.divergence_step(),
        }
    }

    /// Number of invocations stored in the chain.
    pub fn step_count(&self) -> usize {
        self.sequence.steps.len()
    }

    /// Retention artifact class for chain failures.
    pub fn artifact_class(&self) -> &'static str {
        SEQUENCE_BUNDLE_ARTIFACT_CLASS
    }

    /// Drops the chain context and returns the single-step failure document.
    pub fn into_bundle_document(self) -> CaseBundleDocument {
        self.bundle
    }

    /// Validates both schema layers and the chain itself.
    pub fn validate(&self) -> Result<(), BundlePersistError> {
        if !SUPPORTED_SEQUENCE_BUNDLE_SCHEMAS.contains(&self.schema) {
            return Err(BundlePersistError::UnsupportedSchema { found: self.schema });
        }
        if !SUPPORTED_SEQUENCE_SCHEMAS.contains(&self.sequence.schema) {
            return Err(BundlePersistError::Sequence(format!(
                "unsupported sequence schema {} (supported: {SUPPORTED_SEQUENCE_SCHEMAS:?})",
                self.sequence.schema
            )));
        }
        if self.sequence.steps.is_empty() {
            return Err(BundlePersistError::Sequence(
                "chain has no steps".to_string(),
            ));
        }
        Ok(())
    }
}

/// Serializes a chain failure document to pretty-printed JSON bytes.
pub fn save_sequence_bundle_json(
    doc: &SequenceBundleDocument,
) -> Result<Vec<u8>, BundlePersistError> {
    doc.validate()?;
    Ok(serde_json::to_vec_pretty(doc)?)
}

/// Parses JSON bytes into a [`SequenceBundleDocument`], validating both schemas.
///
/// A plain single-step bundle document still loads: the caller can migrate it
/// with [`SequenceSeed::from_bundle_document`](crate::SequenceSeed::from_bundle_document).
pub fn load_sequence_bundle_json(
    bytes: &[u8],
) -> Result<SequenceBundleDocument, BundlePersistError> {
    let doc: SequenceBundleDocument = serde_json::from_slice(bytes)?;
    doc.validate()?;
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        to_bundle, to_bundle_with_environment, to_bundle_with_rpc_envelope, CrashSignature,
        RpcEnvelopeCapture, RpcRequestEnvelope, RpcResponseEnvelope,
    };

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
        assert!(loaded.rpc_envelope.is_none());
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
            rpc_envelope: None,
            provenance: None,
            original_seed: None,
            shrink_lineage: None,
            engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
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
        assert!(v.get("rpc_envelope").is_none());
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

    #[test]
    fn roundtrip_preserves_rpc_envelope() {
        let request = RpcRequestEnvelope::new(
            "simulateTransaction",
            serde_json::json!({
                "transaction": "test_tx",
                "auth": "should_be_redacted"
            }),
        );
        let response = RpcResponseEnvelope::success(serde_json::json!({
            "results": [{"xdr": "AAAA"}]
        }));
        let envelope =
            RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-03-15T10:30:00Z");
        let bundle = to_bundle_with_rpc_envelope(
            crate::CaseSeed {
                id: 42,
                payload: vec![1, 2, 3],
            },
            envelope,
        );

        let bytes = save_case_bundle_json(&bundle).expect("serialize");
        let loaded = load_case_bundle_json(&bytes).expect("deserialize");

        assert!(loaded.rpc_envelope.is_some());
        let loaded_envelope = loaded.rpc_envelope.unwrap();
        assert_eq!(loaded_envelope.request.method, "simulateTransaction");
        assert_eq!(loaded_envelope.request.params["auth"], "[REDACTED]");
        assert_eq!(loaded_envelope.captured_at, "2024-03-15T10:30:00Z");
    }

    #[test]
    fn backward_compatibility_with_schema_v1() {
        // Simulate a schema v1 document (no rpc_envelope field)
        let json = r#"{
            "schema": 1,
            "seed": {"id": 1, "payload": [1, 2, 3]},
            "signature": {"category": "runtime-failure", "digest": 123, "signature_hash": 456}
        }"#;
        let loaded = load_case_bundle_json(json.as_bytes()).expect("should load schema v1");
        assert_eq!(loaded.seed.id, 1);
        assert!(loaded.rpc_envelope.is_none());
    }

    #[test]
    fn json_contains_rpc_envelope_when_present() {
        let request = RpcRequestEnvelope::new("test", serde_json::json!({}));
        let response = RpcResponseEnvelope::success(serde_json::json!({}));
        let envelope =
            RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-01-01T00:00:00Z");
        let bundle = to_bundle_with_rpc_envelope(
            crate::CaseSeed {
                id: 1,
                payload: vec![],
            },
            envelope,
        );

        let s = String::from_utf8(save_case_bundle_json(&bundle).unwrap()).unwrap();
        assert!(s.contains("rpc_envelope"));
        assert!(s.contains("captured_at"));
        assert!(s.contains("2024-01-01T00:00:00Z"));
    }

    // ── provenance (#1864) ────────────────────────────────────────────────────

    fn sample_provenance() -> crate::provenance::ProvenanceRecord {
        crate::provenance::ProvenanceRecord::new(
            "run-7",
            42,
            "0.1.0",
            crate::provenance::sha256_hex(b"linux/x86_64/unix"),
            "2026-01-01T00:00:00Z",
            "runtime-failure/0000000000000001/0000000000000002",
        )
        .seal()
    }

    #[test]
    fn provenance_survives_document_round_trip() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 42,
            payload: vec![1, 2, 3],
        });
        let doc = CaseBundleDocument::from_bundle(&bundle).with_provenance(sample_provenance());
        let bytes = save_case_bundle_document_json(&doc).unwrap();
        let loaded = load_case_bundle_document_json(&bytes).unwrap();
        loaded
            .verify_provenance(crate::provenance::ProvenancePolicy::Require)
            .unwrap();
        assert!(loaded.provenance.is_some());
    }

    #[test]
    fn tampered_provenance_fails_document_verification() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 1,
            payload: vec![],
        });
        let mut rec = sample_provenance();
        rec.seed_id = 999;
        let doc = CaseBundleDocument::from_bundle(&bundle).with_provenance(rec);
        let err = doc
            .verify_provenance(crate::provenance::ProvenancePolicy::Require)
            .unwrap_err();
        match err {
            BundlePersistError::Provenance(_) => {}
            other => panic!("expected Provenance error, got {other:?}"),
        }
    }

    #[test]
    fn legacy_document_without_provenance_is_accepted_under_warn() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 5,
            payload: vec![7],
        });
        let doc = CaseBundleDocument::from_bundle(&bundle);
        let outcome = doc
            .verify_provenance(crate::provenance::ProvenancePolicy::WarnOnMissing)
            .unwrap();
        assert!(outcome.missing);
    }

    // ── shrink pairing (#1866) ────────────────────────────────────────────────

    #[test]
    fn paired_document_round_trips_both_seeds() {
        let minimal_seed = crate::CaseSeed {
            id: 42,
            payload: vec![0xAA, 0xBB],
        };
        let minimal = CaseBundle {
            seed: minimal_seed.clone(),
            signature: crate::classify(&minimal_seed),
            environment: None,
            failure_payload: Vec::new(),
            rpc_envelope: None,
            engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
        };
        let original_seed = crate::CaseSeed {
            id: 42,
            payload: vec![9, 9, 0xAA, 0xBB, 9],
        };
        let lineage = ShrinkLineage::new("ddmin", 5, 5, 2, 1, 1).with_preserved_field("signature");
        let doc = CaseBundleDocument::from_bundle(&minimal)
            .with_pairing(original_seed.clone(), lineage.clone());

        let bytes = save_case_bundle_document_json(&doc).unwrap();
        let loaded = load_case_bundle_document_json(&bytes).unwrap();

        assert_eq!(loaded.original_seed, Some(original_seed));
        assert_eq!(loaded.shrink_lineage, Some(lineage));
        assert_eq!(loaded.seed, minimal.seed);
        assert!(loaded.original_seed.unwrap().payload.len() > loaded.seed.payload.len());
    }

    #[test]
    fn legacy_document_is_original_only() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        let doc = CaseBundleDocument::from_bundle(&bundle);
        assert!(doc.original_seed.is_none());
        assert!(doc.shrink_lineage.is_none());
        // Legacy: the minimal seed is treated as the original.
        assert_eq!(doc.original_or_minimal_seed(), &doc.seed);
    }

    #[test]
    fn bundle_documents_report_bundle_artifact_class() {
        let bundle = to_bundle(crate::CaseSeed {
            id: 1,
            payload: vec![0],
        });
        let doc = CaseBundleDocument::from_bundle(&bundle);
        assert_eq!(doc.artifact_class(), BUNDLE_ARTIFACT_CLASS);
        assert_eq!(bundle_artifact_class(), "bundle");
    }

    // ── sequence bundles (#1858) ──────────────────────────────────────────────

    /// Three-step chain whose middle step carries the divergent payload.
    fn sample_chain_run() -> (crate::sequence::SequenceSeed, crate::sequence::SequenceRun) {
        use crate::sequence::{StepExecutor, StepExpectation, StepOutcome};

        struct Marking;
        impl StepExecutor for Marking {
            fn execute(
                &mut self,
                step: &crate::sequence::SequenceStep,
                state: &mut Vec<u8>,
            ) -> StepOutcome {
                if step.invocation.contains(&0xFF) {
                    StepOutcome::Failure {
                        class: "auth".to_string(),
                    }
                } else {
                    state.extend_from_slice(&step.invocation);
                    StepOutcome::Success
                }
            }
        }

        let seed = crate::sequence::SequenceSeed::new(
            42,
            vec![
                crate::sequence::SequenceStep::new(
                    vec![1],
                    crate::AuthMode::Enforce,
                    StepExpectation::Success,
                ),
                crate::sequence::SequenceStep::new(
                    vec![0xFF],
                    crate::AuthMode::Enforce,
                    StepExpectation::Success,
                ),
                crate::sequence::SequenceStep::new(
                    vec![3],
                    crate::AuthMode::Enforce,
                    StepExpectation::Success,
                ),
            ],
        );
        let run = crate::sequence::drive_sequence(&seed, &mut Marking);
        assert_eq!(run.verdict.divergence_step(), Some(1));
        (seed, run)
    }

    #[test]
    fn sequence_bundle_round_trip_preserves_chain_and_diagnostics() {
        let (seed, run) = sample_chain_run();
        let bundle = CaseBundleDocument::from_bundle(&to_bundle(crate::CaseSeed {
            id: 42,
            payload: vec![0xFF],
        }));
        let doc = SequenceBundleDocument::from_run(&seed, &run, bundle.clone());

        let bytes = save_sequence_bundle_json(&doc).expect("serialize");
        let loaded = load_sequence_bundle_json(&bytes).expect("deserialize");

        assert_eq!(loaded.schema, SEQUENCE_BUNDLE_SCHEMA_VERSION);
        assert_eq!(loaded.sequence, seed, "full chain survives the round trip");
        assert_eq!(loaded.bundle, bundle, "failing-step evidence survives");
        assert_eq!(loaded.observations, run.observations);
        assert_eq!(loaded.divergence_step, Some(1));
        assert_eq!(loaded.step_count(), 3);
        assert_eq!(loaded.artifact_class(), SEQUENCE_BUNDLE_ARTIFACT_CLASS);
        assert_eq!(bundle_artifact_class(), "bundle");
    }

    #[test]
    fn sequence_bundle_rejects_unsupported_wrapper_schema() {
        let (seed, run) = sample_chain_run();
        let bundle = CaseBundleDocument::from_bundle(&to_bundle(crate::CaseSeed {
            id: 42,
            payload: vec![0xFF],
        }));
        let mut doc = SequenceBundleDocument::from_run(&seed, &run, bundle);
        doc.schema = 999;
        let bytes = serde_json::to_vec(&doc).unwrap();
        match load_sequence_bundle_json(&bytes).unwrap_err() {
            BundlePersistError::UnsupportedSchema { found } => assert_eq!(found, 999),
            other => panic!("expected UnsupportedSchema, got {other:?}"),
        }
    }

    #[test]
    fn sequence_bundle_rejects_empty_chain() {
        let (mut seed, run) = sample_chain_run();
        seed.steps.clear();
        let bundle = CaseBundleDocument::from_bundle(&to_bundle(crate::CaseSeed {
            id: 42,
            payload: vec![0xFF],
        }));
        let doc = SequenceBundleDocument::from_run(&seed, &run, bundle);
        match save_sequence_bundle_json(&doc).unwrap_err() {
            BundlePersistError::Sequence(msg) => assert!(msg.contains("no steps")),
            other => panic!("expected Sequence error, got {other:?}"),
        }
    }

    #[test]
    fn legacy_bundle_document_still_loads_and_migrates_to_one_step() {
        let json = r#"{
            "schema": 1,
            "seed": {"id": 1, "payload": [1, 2, 3]},
            "signature": {"category": "runtime-failure", "digest": 1, "signature_hash": 2}
        }"#;
        let doc = load_case_bundle_document_json(json.as_bytes()).expect("v1 loads");
        let seq = crate::SequenceSeed::from_bundle_document(&doc);
        assert!(seq.is_single_step());
        assert_eq!(
            seq.steps[0].expectation,
            crate::sequence::StepExpectation::Failure {
                class: "runtime-failure".to_string(),
            }
        );
    }
}
