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

    #[test]
    fn parse_accepts_archive_document() {
        let raw = r#"{"schema":1,"seeds":[{"id":1,"payload":[1,2,3]}]}"#;
        let seeds = parse_seeds(raw.as_bytes()).expect("archive should parse");
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, 1);
    }

    #[test]
    fn parse_rejects_malformed_file() {
        let err = parse_seeds(br#"{"schema":1,"seeds":[{"id":"bad"}]}"#)
            .expect_err("malformed input must fail");
        assert!(err.contains("malformed seed input"));
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
    fn validation_accepts_valid_seed_set_and_reports_count() {
        let seeds = vec![
            CaseSeed {
                id: 1,
                payload: vec![1],
            },
            CaseSeed {
                id: 2,
                payload: vec![1, 2, 3],
            },
        ];

        assert!(validate_seeds(&seeds).is_ok());
        assert_eq!(seeds.len(), 2);
    }
}
