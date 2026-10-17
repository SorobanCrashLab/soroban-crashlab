//! Tamper-evident fixture provenance.
//!
//! A fixture in the wild carries a payload plus loose metadata, but nothing that
//! ties it to *which* campaign produced it, under *which* engine version, on
//! *what* environment, or *what* failure it is expected to reproduce. Without
//! that link an attacker with repository write access can plant a "known
//! failing" fixture, or quietly rewrite history, and no auditor can tell.
//!
//! This module defines a [`ProvenanceRecord`] that captures the seed → run →
//! engine → environment chain and protects it against tampering. The design is
//! recorded in [ADR-0011](../../docs/adr/0011-fixture-provenance-hash-chain.md):
//! provenance is sealed with a **SHA-256 hash chain** rather than asymmetric
//! signatures, because release-key infrastructure is not available yet. The
//! `signature` field is reserved so a later ADR can upgrade the scheme without
//! breaking the wire format.
//!
//! Verification is *fail-closed on tamper*: a record whose `content_hash` does
//! not match its contents never verifies, regardless of policy. Policy only
//! controls how a *missing* record is treated ([`ProvenancePolicy`]).

use crate::CrashSignature;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Schema version of the provenance block.
pub const PROVENANCE_SCHEMA_VERSION: u32 = 1;

/// Field / record separator used by the canonical encoding.
///
/// These bytes are outside the printable ASCII range so they are very unlikely
/// to appear inside ids, versions or timestamps, which keeps the encoding
/// unambiguous without length prefixes.
const FIELD_SEP: u8 = 0x1e;
const PAIR_SEP: u8 = 0x1f;

/// The expected failure signature a fixture must reproduce.
///
/// Stored as a canonical string (`category/digest/signature_hash`) so a record
/// is self-describing even when the originating [`CrashSignature`] is not at
/// hand.
pub fn canonical_signature(signature: &CrashSignature) -> String {
    format!(
        "{}/{:016x}/{:016x}",
        signature.category, signature.digest, signature.signature_hash
    )
}

/// Computes the hex-encoded SHA-256 of `bytes`.
///
/// Used for content hashes of fixtures and shrink pairs.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Provenance block recorded when a fixture is captured.
///
/// The block is **canonically encoded** (fixed field order, separator-delimited)
/// before hashing so that the `content_hash` is stable across machines and
/// serialisation round-trips.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProvenanceRecord {
    /// Provenance schema version.
    pub schema: u32,
    /// Campaign / run identifier that produced the fixture.
    pub run_id: String,
    /// Seed identifier within that run.
    pub seed_id: u64,
    /// Engine (crate) version that produced the fixture.
    pub engine_version: String,
    /// Hex-encoded hash of the capturing environment fingerprint.
    pub environment_fingerprint_hash: String,
    /// Capture timestamp (ISO 8601).
    pub capture_timestamp: String,
    /// Canonical expected signature string; see [`canonical_signature`].
    pub expected_signature: String,
    /// Hex-encoded SHA-256 over the canonical encoding of all fields above,
    /// plus [`previous_hash`](Self::previous_hash).
    ///
    /// Empty until the record is [`seal`](Self::seal)ed.
    #[serde(default)]
    pub content_hash: String,
    /// Hash-chain link to the previous record. `None` for a chain root.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_hash: Option<String>,
    /// Reserved for a future asymmetric signature (ADR-0011). Never required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

impl ProvenanceRecord {
    /// Builds an unsealed record (empty `content_hash`).
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        run_id: impl Into<String>,
        seed_id: u64,
        engine_version: impl Into<String>,
        environment_fingerprint_hash: impl Into<String>,
        capture_timestamp: impl Into<String>,
        expected_signature: impl Into<String>,
    ) -> Self {
        Self {
            schema: PROVENANCE_SCHEMA_VERSION,
            run_id: run_id.into(),
            seed_id,
            engine_version: engine_version.into(),
            environment_fingerprint_hash: environment_fingerprint_hash.into(),
            capture_timestamp: capture_timestamp.into(),
            expected_signature: expected_signature.into(),
            content_hash: String::new(),
            previous_hash: None,
            signature: None,
        }
    }

    /// Builds a record for `signature` from explicit environment fields.
    pub fn for_signature(
        run_id: impl Into<String>,
        seed_id: u64,
        engine_version: impl Into<String>,
        environment_fingerprint_hash: impl Into<String>,
        capture_timestamp: impl Into<String>,
        signature: &CrashSignature,
    ) -> Self {
        Self::new(
            run_id,
            seed_id,
            engine_version,
            environment_fingerprint_hash,
            capture_timestamp,
            canonical_signature(signature),
        )
    }

    /// Canonical, order-stable byte encoding of every hashed field.
    fn canonical_encoding(&self) -> Vec<u8> {
        let mut out = Vec::new();
        push_field(&mut out, "schema", &self.schema.to_string());
        push_field(&mut out, "run_id", &self.run_id);
        push_field(&mut out, "seed_id", &self.seed_id.to_string());
        push_field(&mut out, "engine_version", &self.engine_version);
        push_field(
            &mut out,
            "environment_fingerprint_hash",
            &self.environment_fingerprint_hash,
        );
        push_field(&mut out, "capture_timestamp", &self.capture_timestamp);
        push_field(&mut out, "expected_signature", &self.expected_signature);
        push_field(
            &mut out,
            "previous_hash",
            self.previous_hash.as_deref().unwrap_or(""),
        );
        out
    }

    /// Recomputes the content hash from the current fields.
    pub fn compute_content_hash(&self) -> String {
        sha256_hex(&self.canonical_encoding())
    }

    /// Returns a copy with `content_hash` set to the freshly computed value.
    pub fn seal(mut self) -> Self {
        self.content_hash = self.compute_content_hash();
        self
    }

    /// Chains this record behind `previous`, setting `previous_hash` and sealing.
    pub fn link_previous(mut self, previous: &ProvenanceRecord) -> Self {
        self.previous_hash = Some(previous.content_hash.clone());
        self.seal()
    }

    /// Verifies the record's own integrity: schema, presence of a hash, and that
    /// the hash matches the contents.
    pub fn verify(&self) -> Result<(), ProvenanceError> {
        if self.schema != PROVENANCE_SCHEMA_VERSION {
            return Err(ProvenanceError::UnsupportedSchema { found: self.schema });
        }
        if self.content_hash.is_empty() {
            return Err(ProvenanceError::Unsealed);
        }
        let actual = self.compute_content_hash();
        if actual != self.content_hash {
            return Err(ProvenanceError::ContentHashMismatch {
                expected: self.content_hash.clone(),
                found: actual,
            });
        }
        Ok(())
    }
}

fn push_field(out: &mut Vec<u8>, key: &str, value: &str) {
    out.extend_from_slice(key.as_bytes());
    out.push(PAIR_SEP);
    out.extend_from_slice(value.as_bytes());
    out.push(FIELD_SEP);
}

/// Policy controlling how a **missing** provenance block is treated.
///
/// Tampering is always an error; this only decides whether provenance is
/// optional. `WarnOnMissing` is the default transitional mode: legacy fixtures
/// keep loading, but anything that *does* carry provenance must verify.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ProvenancePolicy {
    /// Missing provenance is an error (fixtures must be fully linked).
    Require,
    /// Missing provenance is a warning; present provenance must verify.
    #[default]
    WarnOnMissing,
    /// Provenance is ignored entirely.
    Disabled,
}

impl ProvenancePolicy {
    /// Parses a policy from a CLI-style flag value.
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "require" | "strict" | "error" => Some(ProvenancePolicy::Require),
            "warn" | "warn-on-missing" | "warning" => Some(ProvenancePolicy::WarnOnMissing),
            "off" | "disabled" | "ignore" => Some(ProvenancePolicy::Disabled),
            _ => None,
        }
    }
}

/// Outcome of verifying a single fixture's provenance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvenanceOutcome {
    /// `true` when the fixture has no provenance block at all.
    pub missing: bool,
    /// Human-readable warnings (e.g. missing provenance under `WarnOnMissing`).
    pub warnings: Vec<String>,
}

/// Verifies an optional provenance record under `policy`.
///
/// Returns `Ok` for a valid or (policy-permitted) missing record, and `Err` for
/// a tampered record or a missing record under [`ProvenancePolicy::Require`].
pub fn verify_optional(
    record: Option<&ProvenanceRecord>,
    policy: ProvenancePolicy,
) -> Result<ProvenanceOutcome, ProvenanceError> {
    if policy == ProvenancePolicy::Disabled {
        return Ok(ProvenanceOutcome {
            missing: record.is_none(),
            warnings: Vec::new(),
        });
    }

    match record {
        Some(rec) => {
            rec.verify()?;
            Ok(ProvenanceOutcome {
                missing: false,
                warnings: Vec::new(),
            })
        }
        None => match policy {
            ProvenancePolicy::Require => Err(ProvenanceError::Missing),
            ProvenancePolicy::WarnOnMissing => Ok(ProvenanceOutcome {
                missing: true,
                warnings: vec![
                    "fixture has no provenance block; treating as untrusted legacy fixture"
                        .to_string(),
                ],
            }),
            ProvenancePolicy::Disabled => unreachable!("handled above"),
        },
    }
}

/// Verifies that `records` form a valid hash chain.
///
/// Each record must individually verify, and every non-root record's
/// `previous_hash` must equal the preceding record's `content_hash`.
pub fn verify_chain(records: &[ProvenanceRecord]) -> Result<(), ProvenanceError> {
    let mut previous: Option<&ProvenanceRecord> = None;
    for (index, record) in records.iter().enumerate() {
        record.verify()?;
        match previous {
            None => {
                if record.previous_hash.is_some() {
                    return Err(ProvenanceError::ChainBreak { index });
                }
            }
            Some(prev) => {
                if record.previous_hash.as_deref() != Some(prev.content_hash.as_str()) {
                    return Err(ProvenanceError::ChainBreak { index });
                }
            }
        }
        previous = Some(record);
    }
    Ok(())
}

/// Errors from provenance construction or verification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProvenanceError {
    /// The record's `schema` is not [`PROVENANCE_SCHEMA_VERSION`].
    UnsupportedSchema { found: u32 },
    /// The record has no `content_hash`; it was never sealed.
    Unsealed,
    /// The stored `content_hash` does not match the contents (tamper detected).
    ContentHashMismatch { expected: String, found: String },
    /// Provenance is required but absent.
    Missing,
    /// The hash chain is broken at `index`.
    ChainBreak { index: usize },
}

impl fmt::Display for ProvenanceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProvenanceError::UnsupportedSchema { found } => write!(
                f,
                "unsupported provenance schema {found} (expected {PROVENANCE_SCHEMA_VERSION})"
            ),
            ProvenanceError::Unsealed => write!(f, "provenance record is not sealed"),
            ProvenanceError::ContentHashMismatch { expected, found } => write!(
                f,
                "provenance content hash mismatch: expected {expected}, recomputed {found} (tampered?)"
            ),
            ProvenanceError::Missing => write!(f, "fixture provenance is required but missing"),
            ProvenanceError::ChainBreak { index } => {
                write!(f, "provenance hash chain is broken at record {index}")
            }
        }
    }
}

impl std::error::Error for ProvenanceError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(category: &str) -> CrashSignature {
        CrashSignature {
            category: category.to_string(),
            digest: 0xabc,
            signature_hash: 0x1234_5678_9abc_def0,
        }
    }

    fn record(seed_id: u64) -> ProvenanceRecord {
        ProvenanceRecord::for_signature(
            "run-1",
            seed_id,
            "0.1.0",
            sha256_hex(b"linux/x86_64/unix/0.1.0"),
            "2026-10-17T00:00:00Z",
            &sig("runtime-failure"),
        )
        .seal()
    }

    #[test]
    fn sealed_record_verifies() {
        let rec = record(1);
        assert!(!rec.content_hash.is_empty());
        assert!(record(1).seal().verify().is_ok());
    }

    #[test]
    fn content_hash_is_stable_across_recomputation() {
        let a = record(1).compute_content_hash();
        let b = record(1).compute_content_hash();
        assert_eq!(a, b);
    }

    #[test]
    fn unsealed_record_fails_verification() {
        let rec = ProvenanceRecord::new("run", 1, "0.1.0", "env", "t", "cat/0/0");
        assert_eq!(rec.verify().unwrap_err(), ProvenanceError::Unsealed);
    }

    fn record_hash(seed_id: u64) -> String {
        record(seed_id).content_hash
    }

    #[test]
    fn tampered_field_fails_verification() {
        let mut rec = record(7);
        assert!(rec.verify().is_ok());
        rec.seed_id = 8; // tamper after sealing
        match rec.verify() {
            Err(ProvenanceError::ContentHashMismatch { .. }) => {}
            other => panic!("expected ContentHashMismatch, got {other:?}"),
        }
    }

    #[test]
    fn canonical_signature_is_stable() {
        assert_eq!(canonical_signature(&sig("auth")), "auth/0000000000000abc/123456789abcdef0");
    }

    #[test]
    fn chain_links_records() {
        let first = record(1);
        let second = record(2).link_previous(&first);
        assert_eq!(second.previous_hash.as_deref(), Some(first.content_hash.as_str()));
        assert!(verify_chain(&[first, second]).is_ok());
    }

    #[test]
    fn broken_chain_is_detected() {
        let first = record(1);
        let mut second = record(2).link_previous(&first);
        second.run_id = "tampered".to_string(); // invalidates second.content_hash link
        assert!(verify_chain(&[first, second]).is_err());
    }

    #[test]
    fn chain_root_with_previous_hash_is_rejected() {
        let first = record(1).link_previous(&record(0));
        match verify_chain(&[first]) {
            Err(ProvenanceError::ChainBreak { index }) => assert_eq!(index, 0),
            other => panic!("expected ChainBreak, got {other:?}"),
        }
    }

    #[test]
    fn policy_require_rejects_missing() {
        assert_eq!(
            verify_optional(None, ProvenancePolicy::Require).unwrap_err(),
            ProvenanceError::Missing
        );
    }

    #[test]
    fn policy_warn_allows_missing_but_warns() {
        let outcome = verify_optional(None, ProvenancePolicy::WarnOnMissing).unwrap();
        assert!(outcome.missing);
        assert_eq!(outcome.warnings.len(), 1);
    }

    #[test]
    fn policy_disabled_ignores_tampering() {
        let mut rec = record(3);
        rec.run_id = "tampered".to_string();
        assert!(verify_optional(Some(&rec), ProvenancePolicy::Disabled).is_ok());
    }

    #[test]
    fn policy_disabled_accepts_missing_without_warning() {
        let outcome = verify_optional(None, ProvenancePolicy::Disabled).unwrap();
        assert!(outcome.missing);
        assert!(outcome.warnings.is_empty());
    }

    #[test]
    fn policy_parsing() {
        assert_eq!(ProvenancePolicy::parse("require"), Some(ProvenancePolicy::Require));
        assert_eq!(ProvenancePolicy::parse("WARN"), Some(ProvenancePolicy::WarnOnMissing));
        assert_eq!(ProvenancePolicy::parse("off"), Some(ProvenancePolicy::Disabled));
        assert_eq!(ProvenancePolicy::parse("nonsense"), None);
    }

    #[test]
    fn seal_matches_manual_compute() {
        let unsealed = ProvenanceRecord::for_signature(
            "r",
            5,
            "0.1.0",
            sha256_hex(b"fp"),
            "2026-01-01T00:00:00Z",
            &sig("state"),
        );
        let sealed = unsealed.clone().seal();
        assert_eq!(sealed.content_hash, unsealed.compute_content_hash());
    }

    #[test]
    fn json_roundtrip_preserves_hash() {
        let rec = record(9);
        let json = serde_json::to_string(&rec).unwrap();
        let back: ProvenanceRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(back, rec);
        back.verify().unwrap();
    }
}
