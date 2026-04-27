//! CLI: import external seed files into the local corpus pipeline with validation.
//!
//! Input (file path argument or stdin): either a JSON array of `CaseSeed`
//! objects or a full `CorpusArchive` document. The command validates all seeds
//! and reports how many were accepted.

use crashlab_core::corpus::import_corpus_json;
use crashlab_core::{CaseSeed, SeedSchema, Validate};
use std::env;
use std::fs;
use std::io::{self, Read};
use std::process;

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let input = read_input()?;
    let seeds = parse_seeds(&input)?;
    validate_seeds(&seeds)?;
    println!("accepted_seed_count={}", seeds.len());
    Ok(())
}

fn read_input() -> Result<Vec<u8>, String> {
    let mut args = env::args();
    let _ = args.next();

    if let Some(path) = args.next() {
        if args.next().is_some() {
            return Err("usage: import-corpus [seed-json-path]".to_string());
        }
        return fs::read(&path).map_err(|e| format!("read {path}: {e}"));
    }

    let mut buf = Vec::new();
    io::stdin()
        .read_to_end(&mut buf)
        .map_err(|e| format!("stdin: {e}"))?;
    Ok(buf)
}

fn parse_seeds(bytes: &[u8]) -> Result<Vec<CaseSeed>, String> {
    if bytes.is_empty() {
        return Err("empty input".to_string());
    }

    if let Ok(seeds) = import_corpus_json(bytes) {
        return Ok(seeds);
    }

    serde_json::from_slice::<Vec<CaseSeed>>(bytes)
        .map_err(|e| format!("malformed seed input: {e}"))
}

fn validate_seeds(seeds: &[CaseSeed]) -> Result<(), String> {
    let schema = SeedSchema::default();
    for (idx, seed) in seeds.iter().enumerate() {
        if let Err(errors) = seed.validate(&schema) {
            let details = errors
                .into_iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!(
                "invalid seed at index {idx} (id={}): {details}",
                seed.id
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // =====================================================================
    // Parse Tests: Archive Documents and Raw Seed Arrays
    // =====================================================================

    #[test]
    fn parse_accepts_archive_document() {
        let raw = r#"{"schema":1,"seeds":[{"id":1,"payload":[1,2,3]}]}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("archive should parse");
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, 1);
        assert_eq!(seeds[0].payload, vec![1, 2, 3]);
    }

    #[test]
    fn parse_accepts_raw_seed_array() {
        let raw = r#"[{"id":1,"payload":[1,2,3]},{"id":2,"payload":[4,5,6]}]"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("seed array should parse");
        assert_eq!(seeds.len(), 2);
        assert_eq!(seeds[0].id, 1);
        assert_eq!(seeds[1].id, 2);
    }

    #[test]
    fn parse_accepts_archive_with_multiple_seeds() {
        let raw = r#"{"schema":1,"seeds":[{"id":10,"payload":[1]},{"id":20,"payload":[2,3]},{"id":30,"payload":[4,5,6]}]}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("archive should parse");
        assert_eq!(seeds.len(), 3);
    }

    #[test]
    fn parse_rejects_malformed_file() {
        let err = parse_seeds(br#"{"schema":1,"seeds":[{"id":"bad"}]}"#)
            .expect_err("malformed input must fail");
        assert!(err.contains("malformed seed input"));
    }

    #[test]
    fn parse_rejects_invalid_json() {
        let err = parse_seeds(br#"this is not json"#)
            .expect_err("invalid JSON must fail");
        assert!(err.contains("malformed seed input"));
    }

    #[test]
    fn parse_rejects_empty_input() {
        let err = parse_seeds(br#""#).expect_err("empty input must fail");
        assert!(err.contains("empty input"));
    }

    #[test]
    fn parse_rejects_missing_id_field() {
        let raw = r#"[{"payload":[1,2,3]}]"#;
        let err = parse_seeds(raw.as_bytes())
            .expect_err("missing id field must fail");
        assert!(err.contains("malformed seed input"));
    }

    #[test]
    fn parse_rejects_missing_payload_field() {
        let raw = r#"[{"id":1}]"#;
        let err = parse_seeds(raw.as_bytes())
            .expect_err("missing payload field must fail");
        assert!(err.contains("malformed seed input"));
    }

    // =====================================================================
    // Validation Tests: Boundary Conditions and Edge Cases
    // =====================================================================

    #[test]
    fn validation_accepts_seed_at_minimum_bounds() {
        let seeds = vec![CaseSeed {
            id: 0,           // min_id
            payload: vec![1], // min_payload_len = 1
        }];
        assert!(validate_seeds(&seeds).is_ok());
    }

    #[test]
    fn validation_accepts_seed_at_maximum_bounds() {
        let seeds = vec![CaseSeed {
            id: u64::MAX,                     // max_id
            payload: vec![0u8; 64],           // max_payload_len = 64
        }];
        assert!(validate_seeds(&seeds).is_ok());
    }

    #[test]
    fn validation_rejects_seed_with_empty_payload() {
        let seeds = vec![CaseSeed {
            id: 22,
            payload: vec![],
        }];

        let err = validate_seeds(&seeds).expect_err("invalid seed should fail validation");
        assert!(err.contains("invalid seed at index 0"));
        assert!(err.contains("payload too short"));
    }

    #[test]
    fn validation_rejects_seed_with_payload_exceeding_max() {
        let seeds = vec![CaseSeed {
            id: 1,
            payload: vec![0u8; 65], // exceeds max_payload_len = 64
        }];

        let err = validate_seeds(&seeds).expect_err("payload too long should fail");
        assert!(err.contains("invalid seed at index 0"));
        assert!(err.contains("payload too long"));
    }

    #[test]
    fn validation_accepts_multiple_valid_seeds() {
        let seeds = vec![
            CaseSeed {
                id: 1,
                payload: vec![1],
            },
            CaseSeed {
                id: 2,
                payload: vec![1, 2, 3],
            },
            CaseSeed {
                id: 100,
                payload: vec![0u8; 64],
            },
        ];

        assert!(validate_seeds(&seeds).is_ok());
    }

    #[test]
    fn validation_accepts_seeds_with_duplicate_ids() {
        // Duplicate IDs are allowed (they may be intended for corpus merging)
        let seeds = vec![
            CaseSeed {
                id: 1,
                payload: vec![1, 2],
            },
            CaseSeed {
                id: 1,
                payload: vec![3, 4],
            },
        ];

        assert!(validate_seeds(&seeds).is_ok());
    }

    #[test]
    fn validation_rejects_on_first_invalid_seed() {
        let seeds = vec![
            CaseSeed {
                id: 1,
                payload: vec![1],
            },
            CaseSeed {
                id: 2,
                payload: vec![], // This one is invalid
            },
            CaseSeed {
                id: 3,
                payload: vec![1],
            },
        ];

        let err = validate_seeds(&seeds).expect_err("validation should fail");
        assert!(err.contains("invalid seed at index 1"));
    }

    #[test]
    fn validation_reports_seed_id_in_error() {
        let seeds = vec![CaseSeed {
            id: 99,
            payload: vec![],
        }];

        let err = validate_seeds(&seeds).expect_err("validation should fail");
        assert!(err.contains("id=99"));
    }

    // =====================================================================
    // Integration Tests
    // =====================================================================

    #[test]
    fn roundtrip_archive_document_parse_and_validate() {
        let raw = r#"{"schema":1,"seeds":[{"id":42,"payload":[1,2,3,4,5]}]}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("parse should succeed");
        assert!(validate_seeds(&seeds).is_ok());
        assert_eq!(seeds[0].id, 42);
    }

    #[test]
    fn roundtrip_raw_array_parse_and_validate() {
        let raw = r#"[{"id":1,"payload":[1]},{"id":2,"payload":[2,3]}]"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("parse should succeed");
        assert!(validate_seeds(&seeds).is_ok());
        assert_eq!(seeds.len(), 2);
    }
}
