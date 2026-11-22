//! CLI: export the SHA256 hash of a WASM contract binary for credibility verification.
//!
//! This tool computes and exports cryptographic hashes of compiled Soroban contract
//! artifacts, enabling integrity verification and reproducible builds.
//!
//! Input: file path to WASM binary (argument) or default to soroban-example build artifact
//! Output: JSON document with SHA256 hash, file size, and metadata

use sha2::{Sha256, Digest};
use serde::Serialize;
use serde_json;
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process;

/// JSON schema for WASM hash export.
#[derive(Debug, Serialize, serde::Deserialize, Clone)]
struct WasmHashExport {
    /// Relative or absolute path to the WASM file.
    wasm_path: String,
    /// File size in bytes.
    file_size_bytes: u64,
    /// Hex-encoded SHA256 hash of the WASM binary.
    sha256_hash: String,
    /// Schema version for future compatibility.
    format_version: String,
}

fn main() {
    let wasm_path = get_wasm_path();
    let export = compute_hash(&wasm_path).unwrap_or_else(|e| {
        eprintln!("{e}");
        process::exit(1);
    });

    let output = serde_json::to_string_pretty(&export).unwrap_or_else(|e| {
        eprintln!("serialize: {e}");
        process::exit(1);
    });

    io::stdout()
        .write_all(output.as_bytes())
        .unwrap_or_else(|e| {
            eprintln!("write: {e}");
            process::exit(1);
        });

    // Ensure trailing newline for cleaner output
    println!();
}

/// Determines the WASM file path from CLI arguments or uses default.
fn get_wasm_path() -> PathBuf {
    let mut args = env::args();
    let _ = args.next(); // skip program name
    
    if let Some(path) = args.next() {
        PathBuf::from(path)
    } else {
        // Default to soroban-example build artifact relative to crashlab-core
        PathBuf::from("../soroban-example/target/wasm32-unknown-unknown/release/soroban_example.wasm")
    }
}

/// Computes SHA256 hash of the WASM file at the given path.
fn compute_hash(wasm_path: &Path) -> Result<WasmHashExport, String> {
    // Attempt to resolve the path
    let resolved_path = if wasm_path.is_absolute() {
        wasm_path.to_path_buf()
    } else {
        // Try relative to current directory first, then relative to binary location
        if wasm_path.exists() {
            wasm_path.to_path_buf()
        } else {
            // Attempt resolution from parent directory (for CI/testing contexts)
            let alt_path = Path::new("..").join(wasm_path);
            if alt_path.exists() {
                alt_path
            } else {
                wasm_path.to_path_buf()
            }
        }
    };

    // Read the WASM binary
    let bytes = fs::read(&resolved_path).map_err(|e| {
        format!("failed to read wasm file at {:?}: {}", wasm_path, e)
    })?;

    if bytes.is_empty() {
        return Err(format!("wasm file is empty: {:?}", wasm_path));
    }

    // Compute SHA256 hash
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash_result = hasher.finalize();
    let hash_hex = format!("{:x}", hash_result);

    let file_size = bytes.len() as u64;

    Ok(WasmHashExport {
        wasm_path: wasm_path.display().to_string(),
        file_size_bytes: file_size,
        sha256_hash: hash_hex,
        format_version: "1.0".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_wasm_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        std::env::temp_dir().join(format!("test-wasm-{name}-{nanos}.wasm"))
    }

    /// Helper to create a temporary WASM file with test data.
    fn create_test_wasm(path: &Path, data: &[u8]) -> Result<(), String> {
        fs::write(path, data).map_err(|e| format!("write test wasm: {e}"))
    }

    #[test]
    fn compute_hash_with_valid_wasm_file() {
        let test_path = temp_wasm_path("valid");
        let test_data = b"wasm binary data";
        create_test_wasm(&test_path, test_data).expect("setup");

        let export = compute_hash(&test_path).expect("compute hash");
        
        assert_eq!(export.file_size_bytes, test_data.len() as u64);
        assert!(!export.sha256_hash.is_empty());
        assert_eq!(export.format_version, "1.0");
        assert_eq!(export.wasm_path, test_path.display().to_string());

        let _ = fs::remove_file(&test_path);
    }

    #[test]
    fn compute_hash_with_deterministic_output() {
        let test_path = temp_wasm_path("deterministic");
        let test_data = b"deterministic wasm content";
        create_test_wasm(&test_path, test_data).expect("setup");

        let export1 = compute_hash(&test_path).expect("first hash");
        let export2 = compute_hash(&test_path).expect("second hash");

        // Same file → identical hash (determinism)
        assert_eq!(export1.sha256_hash, export2.sha256_hash);
        assert_eq!(export1.file_size_bytes, export2.file_size_bytes);

        let _ = fs::remove_file(&test_path);
    }

    #[test]
    fn compute_hash_fails_for_missing_file() {
        let missing_path = PathBuf::from("/nonexistent/path/to/wasm/file.wasm");
        let result = compute_hash(&missing_path);

        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("failed to read wasm file"));
    }

    #[test]
    fn compute_hash_fails_for_empty_file() {
        let test_path = temp_wasm_path("empty");
        create_test_wasm(&test_path, b"").expect("setup");

        let result = compute_hash(&test_path);
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("empty"));

        let _ = fs::remove_file(&test_path);
    }

    #[test]
    fn wasm_hash_export_differs_for_different_content() {
        let path1 = temp_wasm_path("content1");
        let path2 = temp_wasm_path("content2");
        
        create_test_wasm(&path1, b"short").expect("setup path1");
        create_test_wasm(&path2, b"this is much longer content").expect("setup path2");

        let export1 = compute_hash(&path1).expect("hash path1");
        let export2 = compute_hash(&path2).expect("hash path2");

        // Different content → different hashes
        assert_ne!(export1.sha256_hash, export2.sha256_hash);
        // File sizes differ due to different content lengths
        assert_ne!(export1.file_size_bytes, export2.file_size_bytes);

        let _ = fs::remove_file(&path1);
        let _ = fs::remove_file(&path2);
    }

    #[test]
    fn wasm_hash_export_json_serialization() {
        let export = WasmHashExport {
            wasm_path: "/path/to/contract.wasm".to_string(),
            file_size_bytes: 54321,
            sha256_hash: "abcd1234ef5678".to_string(),
            format_version: "1.0".to_string(),
        };

        let json = serde_json::to_string_pretty(&export).expect("serialize");
        
        // Verify JSON contains expected fields
        assert!(json.contains("wasm_path"));
        assert!(json.contains("/path/to/contract.wasm"));
        assert!(json.contains("file_size_bytes"));
        assert!(json.contains("54321"));
        assert!(json.contains("sha256_hash"));
        assert!(json.contains("abcd1234ef5678"));
        assert!(json.contains("format_version"));
        assert!(json.contains("1.0"));

        // Verify it can be deserialized back
        let deserialized: WasmHashExport = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.wasm_path, export.wasm_path);
        assert_eq!(deserialized.file_size_bytes, export.file_size_bytes);
        assert_eq!(deserialized.sha256_hash, export.sha256_hash);
    }
}
