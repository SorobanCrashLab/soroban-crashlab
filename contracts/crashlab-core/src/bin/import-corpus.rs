//! CLI: import external seed files into the local corpus pipeline with validation.
//!
//! Input (file path argument, directory argument, or stdin): either a JSON array of `CaseSeed`
//! objects, a single `CaseSeed`, a full `CorpusArchive` document, or exported `FailureScenario`
//! fixtures. The command validates all seeds against `SeedSchema::default()` and reports how
//! many were accepted.

use crashlab_core::corpus::import_corpus_json;
use crashlab_core::{CaseSeed, FailureScenario, SeedSchema, Validate};
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::process;

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let seeds = load_seeds_from_env_args()?;
    validate_seeds(&seeds)?;
    println!("accepted_seed_count={}", seeds.len());
    Ok(())
}

fn load_seeds_from_env_args() -> Result<Vec<CaseSeed>, String> {
    let mut args = env::args();
    let _ = args.next();

    if let Some(path_str) = args.next() {
        if args.next().is_some() {
            return Err("usage: import-corpus [seed-json-path-or-directory]".to_string());
        }
        let path = Path::new(&path_str);
        if path.is_dir() {
            return load_seeds_from_directory(path);
        }
        let bytes = fs::read(path).map_err(|e| format!("read {path_str}: {e}"))?;
        return parse_seeds(&bytes);
    }

    let mut buf = Vec::new();
    io::stdin()
        .read_to_end(&mut buf)
        .map_err(|e| format!("stdin: {e}"))?;
    parse_seeds(&buf)
}

pub fn load_seeds_from_directory(dir: &Path) -> Result<Vec<CaseSeed>, String> {
    let mut all_seeds = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("read dir {}: {e}", dir.display()))?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let bytes = fs::read(&path)
                .map_err(|e| format!("read {}: {e}", path.display()))?;
            let seeds = parse_seeds(&bytes)
                .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
            all_seeds.extend(seeds);
        }
    }

    if all_seeds.is_empty() {
        return Err(format!("no valid JSON fixtures or seeds found in directory {}", dir.display()));
    }

    Ok(all_seeds)
}

pub fn parse_seeds(bytes: &[u8]) -> Result<Vec<CaseSeed>, String> {
    if bytes.is_empty() {
        return Err("empty input".to_string());
    }

    if let Ok(seeds) = import_corpus_json(bytes) {
        return Ok(seeds);
    }

    if let Ok(seeds) = serde_json::from_slice::<Vec<CaseSeed>>(bytes) {
        return Ok(seeds);
    }

    if let Ok(seed) = serde_json::from_slice::<CaseSeed>(bytes) {
        return Ok(vec![seed]);
    }

    if let Ok(scenarios) = serde_json::from_slice::<Vec<FailureScenario>>(bytes) {
        let mut seeds = Vec::with_capacity(scenarios.len());
        for s in scenarios {
            let payload = hex::decode(s.input_payload.trim())
                .map_err(|e| format!("invalid hex in scenario payload: {e}"))?;
            seeds.push(CaseSeed {
                id: s.seed_id,
                payload,
            });
        }
        return Ok(seeds);
    }

    if let Ok(scenario) = serde_json::from_slice::<FailureScenario>(bytes) {
        let payload = hex::decode(scenario.input_payload.trim())
            .map_err(|e| format!("invalid hex in scenario payload: {e}"))?;
        return Ok(vec![CaseSeed {
            id: scenario.seed_id,
            payload,
        }]);
    }

    serde_json::from_slice::<Vec<CaseSeed>>(bytes)
        .map_err(|e| format!("malformed seed input: {e}"))
}

pub fn validate_seeds(seeds: &[CaseSeed]) -> Result<(), String> {
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
    use std::path::PathBuf;

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
    fn parse_accepts_single_seed() {
        let raw = r#"{"id":42,"payload":[1,2,3]}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("single seed should parse");
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, 42);
        assert_eq!(seeds[0].payload, vec![1, 2, 3]);
    }

    #[test]
    fn parse_accepts_failure_scenario() {
        let raw = r#"{"seed_id":7,"input_payload":"","mode":"invoker","failure_class":"empty-input"}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("failure scenario should parse");
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, 7);
        assert_eq!(seeds[0].payload, Vec::<u8>::new());
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

    // =====================================================================
    // Validation Tests: Boundary Conditions and Edge Cases
    // =====================================================================

    #[test]
    fn validation_accepts_seed_at_minimum_bounds() {
        let seeds = vec![CaseSeed {
            id: 0,           // min_id
            payload: vec![], // min_payload_len = 0
        }];
        assert!(validate_seeds(&seeds).is_ok());
    }

    #[test]
    fn validation_accepts_seed_with_empty_payload() {
        let seeds = vec![CaseSeed {
            id: 7,
            payload: vec![],
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
                id: 7,
                payload: vec![],
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
                payload: vec![0u8; 65], // This one is invalid
            },
            CaseSeed {
                id: 3,
                payload: vec![1],
            },
        ];

        let err = validate_seeds(&seeds).expect_err("validation should fail");
        assert!(err.contains("invalid seed at index 1"));
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

    #[test]
    fn import_shipped_fixtures_directory_end_to_end() {
        let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        assert!(fixtures_dir.is_dir(), "fixtures dir must exist");

        let seeds = load_seeds_from_directory(&fixtures_dir)
            .expect("should successfully load all shipped fixtures");
        assert!(!seeds.is_empty(), "fixtures should contain seeds");
        assert!(validate_seeds(&seeds).is_ok(), "all shipped fixtures must pass validation");

        // Verify that empty payload from empty_input_001.json is included and valid
        let empty_seed = seeds.iter().find(|s| s.id == 7);
        assert!(empty_seed.is_some(), "empty_input_001.json (id 7) must be loaded");
        assert_eq!(empty_seed.unwrap().payload, Vec::<u8>::new());
    }
}
