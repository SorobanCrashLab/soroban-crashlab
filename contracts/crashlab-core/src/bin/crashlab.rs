//! CrashLab CLI — campaign control helpers for operators.
//!
//! Run `crashlab run cancel <id>` to request cooperative cancellation for the
//! campaign identified by `id`, `crashlab replay seed <bundle.json>` to
//! replay one persisted seed bundle end to end, or `crashlab regression-suite <path>`
//! to run all regression fixtures from a file or directory.

use crashlab_core::{
    RunId, cancel_marker_path, default_state_dir, replay_mismatch_message, replay_seed_bundle_path,
    replay_success_message, request_cancel_run, run_regression_suite_from_json,
};
use std::fs;
use std::path::Path;

fn main() {
    let mut args = std::env::args();
    let _prog = args.next();

    let a = args.next();
    let b = args.next();
    let c = args.next();
    let d = args.next();

    match (a.as_deref(), b.as_deref(), c.as_deref(), d.as_deref()) {
        (Some("run"), Some("cancel"), Some(id_str), None) => {
            if args.next().is_some() {
                print_usage();
                std::process::exit(1);
            }
            let id: u64 = match id_str.parse() {
                Ok(v) => v,
                Err(_) => {
                    eprintln!("invalid run id: {id_str}");
                    std::process::exit(1);
                }
            };
            let base = default_state_dir();
            let run_id = RunId(id);
            match request_cancel_run(run_id, &base) {
                Ok(()) => {
                    let path = cancel_marker_path(run_id, &base);
                    println!("cancel requested for run {id} ({})", path.display());
                }
                Err(e) => {
                    eprintln!("failed to request cancel: {e}");
                    std::process::exit(1);
                }
            }
        }
        (Some("replay"), Some("seed"), Some(path), None) => {
            if args.next().is_some() {
                print_usage();
                std::process::exit(1);
            }

            match replay_seed_bundle_path(path) {
                Ok(result) if result.matches => {
                    println!("{}", replay_success_message(&result));
                }
                Ok(result) => {
                    eprintln!("{}", replay_mismatch_message(&result));
                    std::process::exit(1);
                }
                Err(err) => {
                    eprintln!("{err}");
                    std::process::exit(1);
                }
            }
        }
        (Some("regression-suite"), Some(path), None, None) => {
            if args.next().is_some() {
                print_usage();
                std::process::exit(1);
            }
            run_regression_suite_command(path);
        }
        _ => {
            print_usage();
            std::process::exit(1);
        }
    }
}

fn print_usage() {
    eprintln!(
        "usage: crashlab run cancel <id>\n\
                crashlab replay seed <bundle-json-path>\n\
                crashlab regression-suite <suite-json-path-or-directory>"
    );
}

fn run_regression_suite_command(path: &str) {
    let path_obj = Path::new(path);

    // Determine if path is a file or directory
    let json_bytes = if path_obj.is_file() {
        // Single file - load it directly
        match fs::read(path_obj) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("failed to read file {}: {}", path, e);
                std::process::exit(1);
            }
        }
    } else if path_obj.is_dir() {
        // Directory - load all .json files and merge into a single array
        match load_fixtures_from_directory(path_obj) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("failed to load fixtures from directory {}: {}", path, e);
                std::process::exit(1);
            }
        }
    } else {
        eprintln!("path does not exist or is not accessible: {}", path);
        std::process::exit(1);
    };

    // Run the regression suite
    match run_regression_suite_from_json(&json_bytes) {
        Ok(summary) => {
            println!("::group::Regression Suite Results");
            println!("Total: {}", summary.total);
            println!("Passed: {}", summary.passed);
            println!("Failed: {}", summary.failed);
            println!("::endgroup::");

            if summary.failed > 0 {
                println!();
                println!("Failed test cases:");
                for case in &summary.cases {
                    if !case.passed {
                        if let Some(ref error) = case.error {
                            eprintln!(
                                "::error::Seed {} ({}): {}",
                                case.seed_id, case.mode, error
                            );
                        } else if let Some(ref actual) = case.actual_failure_class {
                            eprintln!(
                                "::error::Seed {} ({}): expected {}, got {}",
                                case.seed_id, case.mode, case.expected_failure_class, actual
                            );
                        } else {
                            eprintln!(
                                "::error::Seed {} ({}): test failed without details",
                                case.seed_id, case.mode
                            );
                        }
                    }
                }
                std::process::exit(1);
            } else {
                println!();
                println!("✅ All regression tests passed!");
            }
        }
        Err(e) => {
            eprintln!("failed to parse or run regression suite: {}", e);
            std::process::exit(1);
        }
    }
}

fn load_fixtures_from_directory(dir: &Path) -> Result<Vec<u8>, String> {
    let mut scenarios = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| format!("failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .json files
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let bytes = fs::read(&path)
                .map_err(|e| format!("failed to read {}: {}", path.display(), e))?;

            // Try to parse as a single scenario
            if let Ok(scenario) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                // Check if it's an array or a single object
                if scenario.is_array() {
                    // It's already an array of scenarios
                    if let Ok(array) = serde_json::from_slice::<Vec<serde_json::Value>>(&bytes) {
                        scenarios.extend(array);
                    }
                } else {
                    // It's a single scenario
                    scenarios.push(scenario);
                }
            }
        }
    }

    if scenarios.is_empty() {
        return Err("no valid JSON fixtures found in directory".to_string());
    }

    // Serialize the combined array
    serde_json::to_vec(&scenarios).map_err(|e| format!("failed to serialize scenarios: {}", e))
}
