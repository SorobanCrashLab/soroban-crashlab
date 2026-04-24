//! CLI: export a seed list to a canonical corpus archive JSON on stdout.
//!
//! Input (file path argument or stdin): either a JSON array of [`CaseSeed`]
//! objects or a full [`CorpusArchive`] document. Output is always a sorted
//! [`CorpusArchive`] matching [`CORPUS_ARCHIVE_SCHEMA_VERSION`].

use crashlab_core::corpus::{export_corpus_json, import_corpus_json};
use crashlab_core::CaseSeed;
use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::process;

fn main() {
    let input_bytes = read_input();
    let seeds = parse_seeds(&input_bytes).unwrap_or_else(|e| {
        eprintln!("{e}");
        process::exit(1);
    });
    let out = export_corpus_json(&seeds).unwrap_or_else(|e| {
        eprintln!("serialize: {e}");
        process::exit(1);
    });
    io::stdout()
        .write_all(&out)
        .unwrap_or_else(|e| {
            eprintln!("write: {e}");
            process::exit(1);
        });
}

fn read_input() -> Vec<u8> {
    let mut args = env::args();
    let _ = args.next();
    if let Some(path) = args.next() {
        fs::read(&path).unwrap_or_else(|e| {
            eprintln!("read {path}: {e}");
            process::exit(1);
        })
    } else {
        let mut buf = Vec::new();
        io::stdin().read_to_end(&mut buf).unwrap_or_else(|e| {
            eprintln!("stdin: {e}");
            process::exit(1);
        });
        buf
    }
}

fn parse_seeds(bytes: &[u8]) -> Result<Vec<CaseSeed>, String> {
    if bytes.is_empty() {
        return Err("empty input".into());
    }
    if let Ok(seeds) = import_corpus_json(bytes) {
        return Ok(seeds);
    }
    serde_json::from_slice::<Vec<CaseSeed>>(bytes).map_err(|e| format!("parse seeds: {e}"))
}
