//! Portable corpus (seed list) export and import with stable ordering.
//!
//! Seeds are sorted deterministically by `(id, payload)` before serialization so
//! archives round-trip and merge predictably.

use crate::CaseSeed;
use serde::{Deserialize, Serialize};

/// Schema version for [`CorpusArchive`] JSON.
pub const CORPUS_ARCHIVE_SCHEMA_VERSION: u32 = 1;

/// Versioned corpus document for sharing seed sets between hosts and CI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorpusArchive {
    pub schema: u32,
    pub seeds: Vec<CaseSeed>,
}

/// Errors from loading a corpus archive.
#[derive(Debug)]
pub enum CorpusError {
    Json(serde_json::Error),
    UnsupportedSchema { found: u32 },
}

impl std::fmt::Display for CorpusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CorpusError::Json(e) => write!(f, "corpus JSON error: {e}"),
            CorpusError::UnsupportedSchema { found } => {
                write!(f, "unsupported corpus schema version {found}")
            }
        }
    }
}

impl std::error::Error for CorpusError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CorpusError::Json(e) => Some(e),
            CorpusError::UnsupportedSchema { .. } => None,
        }
    }
}

impl From<serde_json::Error> for CorpusError {
    fn from(e: serde_json::Error) -> Self {
        CorpusError::Json(e)
    }
}

fn sort_seeds_deterministic(seeds: &mut [CaseSeed]) {
    seeds.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.payload.cmp(&b.payload)));
}

/// Builds an archive from arbitrary seed order; output order is deterministic.
pub fn corpus_archive_from_seeds(mut seeds: Vec<CaseSeed>) -> CorpusArchive {
    sort_seeds_deterministic(&mut seeds);
    CorpusArchive {
        schema: CORPUS_ARCHIVE_SCHEMA_VERSION,
        seeds,
    }
}

/// Serializes a corpus to pretty JSON bytes.
pub fn export_corpus_json(seeds: &[CaseSeed]) -> Result<Vec<u8>, serde_json::Error> {
    let arch = corpus_archive_from_seeds(seeds.to_vec());
    serde_json::to_vec_pretty(&arch)
}

/// Parses JSON into a corpus and validates `schema`.
pub fn import_corpus_json(bytes: &[u8]) -> Result<Vec<CaseSeed>, CorpusError> {
    let arch: CorpusArchive = serde_json::from_slice(bytes)?;
    if arch.schema != CORPUS_ARCHIVE_SCHEMA_VERSION {
        return Err(CorpusError::UnsupportedSchema { found: arch.schema });
    }
    Ok(arch.seeds)
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
