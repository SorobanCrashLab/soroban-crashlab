//! CLI tool: verify fixture bundles against the current engine schema.
//!
//! Reads one or more [`CaseBundleDocument`] JSON files, runs all five
//! compatibility checks, and exits non-zero if any warnings are found.
//!
//! # Usage
//! ```text
//! check-fixtures <bundle.json> [bundle2.json ...]
//! ```
//!
//! # Exit codes
//! - `0` — all fixtures are compatible.
//! - `1` — at least one warning was produced (details printed to stderr).
//! - `2` — a file could not be read or parsed.

use crashlab_core::{
    check_bundle_fixtures, check_bundle_signature_hashes, check_seed_sanitization,
    SeedSchema,
};
use crashlab_core::bundle_persist::CaseBundleDocument;

fn main() {
    let paths: Vec<String> = std::env::args().skip(1).collect();

    if paths.is_empty() {
        eprintln!("usage: check-fixtures <bundle.json> [bundle2.json ...]");
        std::process::exit(2);
    }

    let mut docs: Vec<CaseBundleDocument> = Vec::new();

    for path in &paths {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("error: cannot read {path}: {e}");
                std::process::exit(2);
            }
        };
        let doc: CaseBundleDocument = match serde_json::from_slice(&bytes) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("error: cannot parse {path}: {e}");
                std::process::exit(2);
            }
        };
        docs.push(doc);
    }

    let seeds: Vec<_> = docs.iter().map(|d| d.seed.clone()).collect();
    let schema = SeedSchema::default();

    let r1 = check_bundle_fixtures(&docs, &schema);
    let r2 = check_bundle_signature_hashes(&docs);
    let r3 = check_seed_sanitization(&seeds);

    let all_warnings: Vec<_> = r1
        .warnings
        .iter()
        .chain(r2.warnings.iter())
        .chain(r3.warnings.iter())
        .collect();

    if all_warnings.is_empty() {
        println!("ok — all {} fixture(s) are compatible.", docs.len());
        std::process::exit(0);
    }

    eprintln!(
        "fixture compatibility check failed: {} warning(s)\n",
        all_warnings.len()
    );
    for w in &all_warnings {
        eprintln!("  [fixture {}] {}", w.fixture_index, w.message);
    }
    std::process::exit(1);
}
