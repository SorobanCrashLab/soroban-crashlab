//! Corpus seed import with validation and error reporting.
//!
//! This module provides high-level functions for importing external seed files
//! into the local mutation corpus with comprehensive validation and error handling.

use crate::{CaseSeed, SeedSchema, Validate};
use serde_json;
use std::fmt;

/// Result type for corpus import operations.
pub type CorpusImportResult<T> = Result<T, CorpusImportError>;

/// Errors that may occur during corpus import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorpusImportError {
    /// Input bytes are empty
    EmptyInput,
    /// JSON parsing failed
    MalformedJson { message: String },
    /// Schema validation failed
    InvalidSeed {
        index: usize,
        seed_id: u64,
        details: String,
    },
    /// No valid seeds found
    NoValidSeeds,
}

impl fmt::Display for CorpusImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CorpusImportError::EmptyInput => write!(f, "empty input provided"),
            CorpusImportError::MalformedJson { message } => {
                write!(f, "malformed seed input: {}", message)
            }
            CorpusImportError::InvalidSeed {
                index,
                seed_id,
                details,
            } => {
                write!(
                    f,
                    "invalid seed at index {} (id={}): {}",
                    index, seed_id, details
                )
            }
            CorpusImportError::NoValidSeeds => write!(f, "no valid seeds found in input"),
        }
    }
}

impl std::error::Error for CorpusImportError {}

/// Import seeds from JSON bytes with full validation.
///
/// Accepts either a `CorpusArchive` document or a raw `Vec<CaseSeed>` array.
/// All seeds are validated against the provided schema.
///
/// # Arguments
/// * `bytes` - JSON bytes to parse
/// * `schema` - Schema for validating seeds (use `SeedSchema::default()` for standard validation)
///
/// # Returns
/// * `Ok(seeds)` - Validated seed list
/// * `Err(CorpusImportError)` - First validation error encountered
///
/// # Examples
/// ```no_run
/// # use crashlab_core::{CaseSeed, SeedSchema};
/// let json_bytes = br#"[{"id":1,"payload":[1,2,3]}]"#;
/// let seeds = crashlab_core::import_seeds_with_schema(json_bytes, &SeedSchema::default())?;
/// assert_eq!(seeds.len(), 1);
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn import_seeds_with_schema(
    bytes: &[u8],
    schema: &SeedSchema,
) -> CorpusImportResult<Vec<CaseSeed>> {
    if bytes.is_empty() {
        return Err(CorpusImportError::EmptyInput);
    }

    let seeds = parse_seeds_json(bytes)?;

    if seeds.is_empty() {
        return Err(CorpusImportError::NoValidSeeds);
    }

    validate_seeds_list(&seeds, schema)?;
    Ok(seeds)
}

/// Import seeds with default schema validation.
///
/// Convenience wrapper around `import_seeds_with_schema` using `SeedSchema::default()`.
pub fn import_seeds(bytes: &[u8]) -> CorpusImportResult<Vec<CaseSeed>> {
    import_seeds_with_schema(bytes, &SeedSchema::default())
}

/// Parse JSON into seeds (archive or raw array).
///
/// First attempts to parse as `CorpusArchive`, falls back to raw array.
fn parse_seeds_json(bytes: &[u8]) -> CorpusImportResult<Vec<CaseSeed>> {
    use crate::corpus::import_corpus_json;

    if let Ok(seeds) = import_corpus_json(bytes) {
        return Ok(seeds);
    }

    serde_json::from_slice::<Vec<CaseSeed>>(bytes).map_err(|e| CorpusImportError::MalformedJson {
        message: e.to_string(),
    })
}

/// Validate all seeds against schema.
fn validate_seeds_list(
    seeds: &[CaseSeed],
    schema: &SeedSchema,
) -> CorpusImportResult<()> {
    for (idx, seed) in seeds.iter().enumerate() {
        if let Err(errors) = seed.validate(schema) {
            let details = errors
                .into_iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(CorpusImportError::InvalidSeed {
                index: idx,
                seed_id: seed.id,
                details,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_accepts_corpus_archive() {
        let json = br#"{"schema":1,"seeds":[{"id":1,"payload":[1,2,3]}]}"#;
        let seeds = import_seeds(json).expect("import should succeed");
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, 1);
    }

    #[test]
    fn import_accepts_raw_seed_array() {
        let json = br#"[{"id":1,"payload":[1,2]},{"id":2,"payload":[3,4,5]}]"#;
        let seeds = import_seeds(json).expect("import should succeed");
        assert_eq!(seeds.len(), 2);
    }

    #[test]
    fn import_rejects_empty_input() {
        let err = import_seeds(b"").expect_err("empty input should fail");
        assert_eq!(err, CorpusImportError::EmptyInput);
    }

    #[test]
    fn import_rejects_malformed_json() {
        let err = import_seeds(b"not json").expect_err("malformed json should fail");
        match err {
            CorpusImportError::MalformedJson { .. } => (),
            _ => panic!("expected MalformedJson"),
        }
    }

    #[test]
    fn import_rejects_invalid_seed_payload_too_short() {
        let json = br#"[{"id":1,"payload":[]}]"#;
        let err = import_seeds(json).expect_err("empty payload should fail");
        match err {
            CorpusImportError::InvalidSeed { index, details, .. } => {
                assert_eq!(index, 0);
                assert!(details.contains("payload too short"));
            }
            _ => panic!("expected InvalidSeed"),
        }
    }

    #[test]
    fn import_rejects_invalid_seed_payload_too_long() {
        let json = br#"[{"id":1,"payload":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]"#;
        let err = import_seeds(json).expect_err("payload too long should fail");
        match err {
            CorpusImportError::InvalidSeed { index, details, .. } => {
                assert_eq!(index, 0);
                assert!(details.contains("payload too long"));
            }
            _ => panic!("expected InvalidSeed"),
        }
    }

    #[test]
    fn import_rejects_first_invalid_seed_in_batch() {
        let json = br#"[{"id":1,"payload":[1,2,3]},{"id":2,"payload":[]},{"id":3,"payload":[1]}]"#;
        let err = import_seeds(json).expect_err("second seed is invalid");
        match err {
            CorpusImportError::InvalidSeed {
                index,
                seed_id,
                details,
            } => {
                assert_eq!(index, 1);
                assert_eq!(seed_id, 2);
                assert!(details.contains("payload too short"));
            }
            _ => panic!("expected InvalidSeed"),
        }
    }

    #[test]
    fn import_with_custom_schema() {
        let json = br#"[{"id":1,"payload":[1,2,3,4,5,6,7,8,9,10]}]"#;
        let schema = SeedSchema::with_payload_bounds(5, 15);
        let seeds = import_seeds_with_schema(json, &schema).expect("import with custom schema");
        assert_eq!(seeds.len(), 1);
    }

    #[test]
    fn import_with_custom_schema_rejects_undersized_payload() {
        let json = br#"[{"id":1,"payload":[1,2]}]"#;
        let schema = SeedSchema::with_payload_bounds(5, 15);
        let err =
            import_seeds_with_schema(json, &schema).expect_err("payload too small for schema");
        match err {
            CorpusImportError::InvalidSeed { details, .. } => {
                assert!(details.contains("payload too short"));
            }
            _ => panic!("expected InvalidSeed"),
        }
    }

    #[test]
    fn import_accepts_boundary_seed_ids() {
        let json = br#"[{"id":0,"payload":[1]},{"id":18446744073709551615,"payload":[2]}]"#;
        let seeds = import_seeds(json).expect("boundary IDs should be accepted");
        assert_eq!(seeds.len(), 2);
        assert_eq!(seeds[0].id, 0);
        assert_eq!(seeds[1].id, u64::MAX);
    }

    #[test]
    fn import_accepts_multiple_seeds_with_duplicate_ids() {
        let json = br#"[{"id":1,"payload":[1]},{"id":1,"payload":[2,3]}]"#;
        let seeds = import_seeds(json).expect("duplicate IDs should be allowed");
        assert_eq!(seeds.len(), 2);
        assert_eq!(seeds[0].id, seeds[1].id);
    }
}
