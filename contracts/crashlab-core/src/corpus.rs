//! Portable corpus (seed list) export and import with stable ordering and content addressing.
//!
//! Seeds are sorted deterministically by `(id, payload)` before serialization so
//! archives round-trip and merge predictably. Content addressing via SHA-256 hash
//! enables corruption detection and repair (#1802).

use crate::CaseSeed;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};

/// Schema version for [`CorpusArchive`] JSON.
pub const CORPUS_ARCHIVE_SCHEMA_VERSION: u32 = 2;

/// Seed with content-addressed integrity metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AddressedSeed {
    pub id: u32,
    pub payload: Vec<u8>,
    pub size: usize,
    pub hash: String,
}

/// Versioned corpus document for sharing seed sets between hosts and CI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorpusArchive {
    pub schema: u32,
    pub seeds: Vec<CaseSeed>,
    #[serde(default)]
    pub addressed: Option<Vec<AddressedSeed>>,
}

/// Corpus verification result.
#[derive(Debug, Clone)]
pub enum CorpusVerifyStatus {
    Valid,
    Corrupt { seed_id: u32, reason: String },
    Missing { seed_id: u32 },
    Orphaned { seed_id: u32 },
}

/// Errors from loading a corpus archive.
#[derive(Debug)]
pub enum CorpusError {
    Json(serde_json::Error),
    UnsupportedSchema { found: u32 },
    Integrity(String),
}

impl std::fmt::Display for CorpusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CorpusError::Json(e) => write!(f, "corpus JSON error: {e}"),
            CorpusError::UnsupportedSchema { found } => {
                write!(f, "unsupported corpus schema version {found}")
            }
            CorpusError::Integrity(msg) => write!(f, "corpus integrity error: {msg}"),
        }
    }
}

impl std::error::Error for CorpusError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CorpusError::Json(e) => Some(e),
            CorpusError::UnsupportedSchema { .. } => None,
            CorpusError::Integrity(_) => None,
        }
    }
}

impl From<serde_json::Error> for CorpusError {
    fn from(e: serde_json::Error) -> Self {
        CorpusError::Json(e)
    }
}

/// Compute SHA-256 hash of seed payload.
pub fn hash_seed_payload(payload: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload);
    format!("{:x}", hasher.finalize())
}

/// Verify seed integrity: hash matches payload.
pub fn verify_seed_integrity(seed: &AddressedSeed) -> Result<(), CorpusError> {
    let computed = hash_seed_payload(&seed.payload);
    if computed != seed.hash {
        return Err(CorpusError::Integrity(
            format!("seed {} hash mismatch: expected {}, got {}", seed.id, seed.hash, computed),
        ));
    }
    if seed.payload.len() != seed.size {
        return Err(CorpusError::Integrity(
            format!("seed {} size mismatch: expected {}, got {}", seed.id, seed.size, seed.payload.len()),
        ));
    }
    Ok(())
}

fn sort_seeds_deterministic(seeds: &mut [CaseSeed]) {
    seeds.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.payload.cmp(&b.payload)));
}

fn sort_addressed_deterministic(seeds: &mut [AddressedSeed]) {
    seeds.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.payload.cmp(&b.payload)));
}

/// Builds an archive from arbitrary seed order; output order is deterministic.
pub fn corpus_archive_from_seeds(mut seeds: Vec<CaseSeed>) -> CorpusArchive {
    sort_seeds_deterministic(&mut seeds);
    let addressed = seeds.iter().map(|s| AddressedSeed {
        id: s.id,
        size: s.payload.len(),
        hash: hash_seed_payload(&s.payload),
        payload: s.payload.clone(),
    }).collect();
    CorpusArchive {
        schema: CORPUS_ARCHIVE_SCHEMA_VERSION,
        seeds,
        addressed: Some(addressed),
    }
}

/// Serializes a corpus to pretty JSON bytes with content addressing.
pub fn export_corpus_json(seeds: &[CaseSeed]) -> Result<Vec<u8>, serde_json::Error> {
    let arch = corpus_archive_from_seeds(seeds.to_vec());
    serde_json::to_vec_pretty(&arch)
}

/// Parses JSON into a corpus, validates schema, and verifies integrity.
pub fn import_corpus_json(bytes: &[u8]) -> Result<Vec<CaseSeed>, CorpusError> {
    let arch: CorpusArchive = serde_json::from_slice(bytes)?;
    if arch.schema > CORPUS_ARCHIVE_SCHEMA_VERSION {
        return Err(CorpusError::UnsupportedSchema { found: arch.schema });
    }

    // Verify addressed seeds if present (v2+)
    if let Some(addressed) = &arch.addressed {
        for seed in addressed {
            verify_seed_integrity(seed)?;
        }
    }

    Ok(arch.seeds)
}

/// Verify corpus integrity: scan all seeds and report issues.
pub fn verify_corpus_integrity(archive: &CorpusArchive) -> Vec<CorpusVerifyStatus> {
    let mut issues = Vec::new();

    if let Some(addressed) = &archive.addressed {
        for seed in addressed {
            if let Err(e) = verify_seed_integrity(seed) {
                issues.push(CorpusVerifyStatus::Corrupt {
                    seed_id: seed.id,
                    reason: e.to_string(),
                });
            }
        }
    }

    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_sorts_by_id_then_payload() {
        let seeds = vec![
            CaseSeed {
                id: 2,
                payload: vec![1],
            },
            CaseSeed {
                id: 1,
                payload: vec![2],
            },
            CaseSeed {
                id: 1,
                payload: vec![1],
            },
        ];
        let bytes = export_corpus_json(&seeds).unwrap();
        let loaded = import_corpus_json(&bytes).unwrap();
        assert_eq!(loaded[0].id, 1);
        assert_eq!(loaded[0].payload, vec![1]);
        assert_eq!(loaded[1].id, 1);
        assert_eq!(loaded[1].payload, vec![2]);
        assert_eq!(loaded[2].id, 2);
    }

    #[test]
    fn roundtrip_preserves_order_after_reimport() {
        let seeds: Vec<CaseSeed> = (0..5)
            .map(|i| CaseSeed {
                id: i,
                payload: vec![i as u8; 3],
            })
            .collect();
        let bytes = export_corpus_json(&seeds).unwrap();
        let again = import_corpus_json(&bytes).unwrap();
        let bytes2 = export_corpus_json(&again).unwrap();
        assert_eq!(bytes, bytes2);
    }

    #[test]
    fn rejects_wrong_schema() {
        let raw = r#"{"schema":999,"seeds":[]}"#;
        let err = import_corpus_json(raw.as_bytes()).unwrap_err();
        match err {
            CorpusError::UnsupportedSchema { found } => assert_eq!(found, 999),
            _ => panic!("expected UnsupportedSchema"),
        }
    }
}
