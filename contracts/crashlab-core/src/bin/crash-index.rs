//! CLI: build a dedup index from crash bundles and report grouped counts.
//!
//! Reads one or more [`CaseBundleDocument`] JSON files, indexes them by
//! signature hash via [`CrashIndex`], and prints a grouped summary table.
//!
//! # Usage
//! ```text
//! crash-index <bundle.json> [bundle2.json ...]
//! ```
//!
//! # Environment variables
//! - `CRASHLAB_OUTPUT_FORMAT` — Set to `json` to output JSON instead of a CLI table.
//!   Used for the Rust ↔ Next.js data bridge.
//!
//! # Exit codes
//! - `0` — summary printed successfully.
//! - `2` — a file could not be read or parsed.

use crashlab_core::{CrashIndex, load_case_bundle_json};

fn main() {
    let paths: Vec<String> = std::env::args().skip(1).collect();

    if paths.is_empty() {
        eprintln!("usage: crash-index <bundle.json> [bundle2.json ...]");
        std::process::exit(2);
    }

    let mut index = CrashIndex::new();

    for path in &paths {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("error: cannot read {path}: {e}");
                std::process::exit(2);
            }
        };

        let bundle = match load_case_bundle_json(&bytes) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("error: cannot parse {path}: {e}");
                std::process::exit(2);
            }
        };

        index.insert(bundle);
    }

    let summary = index.summary();

    // Check for JSON output format (used for Rust ↔ Next.js data bridge)
    if std::env::var("CRASHLAB_OUTPUT_FORMAT").as_deref() == Ok("json") {
        match summary.to_json() {
            Ok(json_bytes) => {
                print!("{}", String::from_utf8_lossy(&json_bytes));
            }
            Err(e) => {
                eprintln!("error: failed to serialize JSON: {e}");
                std::process::exit(2);
            }
        }
    } else {
        print!("{}", summary.to_cli_table());
        println!(
            "--- {} unique signature(s), {} total crash(es) ---",
            summary.unique_signatures, summary.total_crashes
        );
    }
}
