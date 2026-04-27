//! CLI: lint fixture manifests for schema, naming, and duplicate IDs.
//!
//! Reads one or more [`FixtureManifest`] JSON files, runs [`FixtureLinter`]
//! checks on every entry, and exits non-zero when errors are found.
//!
//! # Usage
//! ```text
//! lint-fixtures <manifest.json> [manifest2.json ...]
//! ```
//!
//! # Exit codes
//! - `0` — all fixtures pass linting.
//! - `1` — at least one lint error or critical issue was found.
//! - `2` — a file could not be read or parsed.

use crashlab_core::{FixtureLinter, LintLevel};
use crashlab_core::fixture_manifest::FixtureManifest;

fn main() {
    let paths: Vec<String> = std::env::args().skip(1).collect();

    if paths.is_empty() {
        eprintln!("usage: lint-fixtures <manifest.json> [manifest2.json ...]");
        std::process::exit(2);
    }

    let linter = FixtureLinter::new();
    let mut all_ids: Vec<String> = Vec::new();
    let mut error_count = 0usize;
    let mut parse_error = false;

    for path in &paths {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("error: cannot read {path}: {e}");
                parse_error = true;
                continue;
            }
        };

        let manifest: FixtureManifest = match serde_json::from_slice(&bytes) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("error: cannot parse {path}: {e}");
                parse_error = true;
                continue;
            }
        };

        for meta in manifest.fixtures.values() {
            let report = linter.lint_metadata(
                &meta.id,
                &meta.fixture_type,
                meta.failure_category.as_deref(),
            );

            for issue in &report.issues {
                println!("[{}] {} (fixture: {})", issue.level, issue.message, meta.id);
                if issue.level >= LintLevel::Error {
                    error_count += 1;
                }
            }

            all_ids.push(meta.id.clone());
        }
    }

    // Check for duplicate IDs across all manifests.
    let id_refs: Vec<&str> = all_ids.iter().map(String::as_str).collect();
    let dup_report = linter.check_duplicate_ids(&id_refs);
    for issue in &dup_report.issues {
        println!("[{}] {}", issue.level, issue.message);
        if issue.level >= LintLevel::Error {
            error_count += 1;
        }
    }

    if parse_error {
        std::process::exit(2);
    }

    if error_count > 0 {
        eprintln!("lint failed: {error_count} error(s) found across {} fixture(s).", all_ids.len());
        std::process::exit(1);
    }

    println!("ok — {} fixture(s) passed linting.", all_ids.len());
}
