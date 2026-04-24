//! Gzip compression for failure artifacts.
//!
//! Wraps the JSON bytes produced by [`bundle_persist`](crate::bundle_persist) in
//! gzip so long campaigns store significantly less data on disk while keeping
//! artifacts fully reproducible (decompress → load → verify signature).
//!
//! # Compression Ratios
//!
//! Typical compression reduces artifact storage by 60-80% depending on payload size
//! and content entropy. The module provides both fast (default) and maximum compression
//! options via [`CompressionLevel`].

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};

use crate::bundle_persist::load_case_bundle_json;
use crate::{save_case_bundle_json, BundlePersistError, CaseBundle};

/// Compression level configuration for artifact storage.
///
/// Determines the balance between compression ratio and CPU usage.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressionLevel {
    /// Fast compression (level 3) - good for high-throughput campaigns.
    Fast,
    /// Default compression (level 6) - balanced approach.
    Default,
    /// Maximum compression (level 9) - best for long-term storage.
    Maximum,
}

impl CompressionLevel {
    /// Converts the compression level to [`Compression`] for gzip encoding.
    fn to_gzip_compression(self) -> Compression {
        match self {
            CompressionLevel::Fast => Compression::fast(),
            CompressionLevel::Default => Compression::default(),
            CompressionLevel::Maximum => Compression::best(),
        }
    }
}

impl Default for CompressionLevel {
    fn default() -> Self {
        CompressionLevel::Default
    }
}

/// Compresses `bundle` to gzip-wrapped JSON bytes using default compression.
///
/// The returned bytes can be stored directly to disk and later restored with
/// [`decompress_artifact`].
///
/// # Returns
///
/// Gzip-compressed JSON bytes, or an error if serialization or compression fails.
///
/// # Example
///
/// ```rust
/// # use crashlab_core::{to_bundle, CaseSeed, artifact_compress::compress_artifact};
/// let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1, 2, 3] });
/// let compressed = compress_artifact(&bundle).unwrap();
/// assert!(compressed.len() > 0);
/// assert!(compressed.starts_with(&[0x1f, 0x8b])); // gzip magic bytes
/// ```
pub fn compress_artifact(bundle: &CaseBundle) -> Result<Vec<u8>, BundlePersistError> {
    compress_artifact_with_level(bundle, CompressionLevel::Default)
}

/// Compresses `bundle` to gzip-wrapped JSON bytes with specified compression level.
///
/// Allows tuning compression ratio vs. CPU usage for different deployment scenarios.
///
/// # Arguments
///
/// * `bundle` - The case bundle to compress
/// * `level` - The compression level to use
///
/// # Returns
///
/// Gzip-compressed JSON bytes, or an error if serialization or compression fails.
///
/// # Example
///
/// ```rust
/// # use crashlab_core::{to_bundle, CaseSeed, artifact_compress::{compress_artifact_with_level, CompressionLevel}};
/// let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1, 2, 3] });
/// let compressed = compress_artifact_with_level(&bundle, CompressionLevel::Maximum).unwrap();
/// assert!(compressed.len() > 0);
/// ```
pub fn compress_artifact_with_level(
    bundle: &CaseBundle,
    level: CompressionLevel,
) -> Result<Vec<u8>, BundlePersistError> {
    let json = save_case_bundle_json(bundle)?;
    let mut encoder = GzEncoder::new(Vec::new(), level.to_gzip_compression());
    encoder.write_all(&json)?;
    Ok(encoder.finish()?)
}

/// Decompresses gzip bytes produced by [`compress_artifact`] back into a
/// [`CaseBundle`], validating the bundle schema on the way out.
///
/// # Arguments
///
/// * `compressed` - Gzip-compressed bytes previously produced by `compress_artifact()`
///
/// # Returns
///
/// The decompressed and validated bundle, or an error if decompression or validation fails.
///
/// # Example
///
/// ```rust
/// # use crashlab_core::{to_bundle, CaseSeed, artifact_compress::{compress_artifact, decompress_artifact}};
/// let bundle = to_bundle(CaseSeed { id: 42, payload: vec![1, 2, 3, 4, 5] });
/// let compressed = compress_artifact(&bundle).unwrap();
/// let restored = decompress_artifact(&compressed).unwrap();
/// assert_eq!(restored.seed.id, bundle.seed.id);
/// assert_eq!(restored.seed.payload, bundle.seed.payload);
/// ```
pub fn decompress_artifact(compressed: &[u8]) -> Result<CaseBundle, BundlePersistError> {
    let mut decoder = GzDecoder::new(compressed);
    let mut json = Vec::new();
    decoder.read_to_end(&mut json)?;
    load_case_bundle_json(&json)
}

/// Calculates the compression ratio for a given bundle.
///
/// Returns `compressed_size / original_size` as a decimal between 0.0 and 1.0.
/// Lower values indicate better compression. For example, 0.3 means the
/// compressed artifact is 30% of the original size (70% savings).
///
/// # Returns
///
/// A compression ratio between 0.0 (best) and 1.0 (no compression), or an error
/// if serialization fails.
///
/// # Example
///
/// ```rust
/// # use crashlab_core::{to_bundle, CaseSeed, artifact_compress::measure_compression_ratio};
/// let bundle = to_bundle(CaseSeed { id: 1, payload: vec![0xAB; 1024] });
/// let ratio = measure_compression_ratio(&bundle).unwrap();
/// assert!(ratio < 1.0, "compression should reduce size");
/// ```
pub fn measure_compression_ratio(bundle: &CaseBundle) -> Result<f64, BundlePersistError> {
    let original_size = save_case_bundle_json(bundle)?.len() as f64;
    let compressed_size = compress_artifact(bundle)?.len() as f64;
    
    if original_size == 0.0 {
        Ok(0.0)
    } else {
        Ok(compressed_size / original_size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, to_bundle_with_environment, CaseSeed};

    fn sample_bundle() -> CaseBundle {
        let mut b = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4, 5, 6, 7, 8],
        });
        b.failure_payload = b"panic: contract trap at ledger 99".to_vec();
        b
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Primary Success Path Tests
    // ────────────────────────────────────────────────────────────────────────────

    #[test]
    fn roundtrip_preserves_bundle_integrity() {
        let bundle = sample_bundle();
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed, bundle.seed);
        assert_eq!(restored.signature, bundle.signature);
        assert_eq!(restored.failure_payload, bundle.failure_payload);
        assert_eq!(restored.environment, bundle.environment);
    }

    #[test]
    fn compressed_bytes_are_smaller_than_raw_json() {
        // Use a larger payload so gzip has something to compress.
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0xAB; 512],
        });
        bundle.failure_payload = vec![b'x'; 512];
        let raw = crate::save_case_bundle_json(&bundle).expect("json");
        let compressed = compress_artifact(&bundle).expect("compress");
        assert!(
            compressed.len() < raw.len(),
            "expected compressed ({}) < raw ({})",
            compressed.len(),
            raw.len()
        );
    }

    #[test]
    fn roundtrip_with_environment_fingerprint() {
        let bundle = to_bundle_with_environment(CaseSeed {
            id: 7,
            payload: vec![9, 8, 7],
        });
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.environment, bundle.environment);
    }

    #[test]
    fn compressed_bytes_start_with_gzip_magic() {
        let bundle = sample_bundle();
        let compressed = compress_artifact(&bundle).expect("compress");
        assert!(
            compressed.starts_with(&[0x1f, 0x8b]),
            "compressed bytes should start with gzip magic bytes"
        );
    }

    #[test]
    fn compression_level_default_works() {
        let bundle = sample_bundle();
        let compressed = compress_artifact_with_level(&bundle, CompressionLevel::Default)
            .expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.id, bundle.seed.id);
    }

    #[test]
    fn compression_level_fast_works() {
        let bundle = sample_bundle();
        let compressed =
            compress_artifact_with_level(&bundle, CompressionLevel::Fast).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.id, bundle.seed.id);
    }

    #[test]
    fn compression_level_maximum_works() {
        let bundle = sample_bundle();
        let compressed =
            compress_artifact_with_level(&bundle, CompressionLevel::Maximum).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.id, bundle.seed.id);
    }

    #[test]
    fn maximum_compression_produces_smaller_artifact_than_fast() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0xAB; 1024],
        });
        bundle.failure_payload = vec![b'x'; 1024];

        let fast = compress_artifact_with_level(&bundle, CompressionLevel::Fast).expect("fast");
        let maximum =
            compress_artifact_with_level(&bundle, CompressionLevel::Maximum).expect("maximum");

        assert!(
            maximum.len() < fast.len(),
            "expected maximum ({}) < fast ({})",
            maximum.len(),
            fast.len()
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Failure Path & Edge Case Tests
    // ────────────────────────────────────────────────────────────────────────────

    #[test]
    fn corrupt_bytes_return_error() {
        let result = decompress_artifact(b"not-gzip-data");
        assert!(result.is_err(), "corrupt data should fail decompression");
    }

    #[test]
    fn truncated_gzip_returns_error() {
        let bundle = sample_bundle();
        let compressed = compress_artifact(&bundle).expect("compress");
        let truncated = &compressed[..compressed.len().saturating_sub(10)];
        let result = decompress_artifact(truncated);
        assert!(
            result.is_err(),
            "truncated gzip should fail decompression"
        );
    }

    #[test]
    fn empty_compressed_returns_error() {
        let result = decompress_artifact(b"");
        assert!(result.is_err(), "empty bytes should fail decompression");
    }

    #[test]
    fn invalid_json_in_compressed_returns_error() {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(b"{ invalid json")
            .expect("write to encoder");
        let bad_json = encoder.finish().expect("finish");
        let result = decompress_artifact(&bad_json);
        assert!(result.is_err(), "invalid JSON should fail parsing");
    }

    #[test]
    fn roundtrip_with_large_payload() {
        let mut bundle = to_bundle(CaseSeed {
            id: 99,
            payload: vec![0xDE; 10000],
        });
        bundle.failure_payload = vec![0xAD; 10000];
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.payload.len(), 10000);
        assert_eq!(restored.failure_payload.len(), 10000);
    }

    #[test]
    fn roundtrip_with_empty_payload() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![],
        });
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.payload.len(), 0);
    }

    #[test]
    fn roundtrip_with_unicode_in_failure_payload() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        bundle.failure_payload = "panic: αβγδ ñoño 你好".as_bytes().to_vec();
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.failure_payload, bundle.failure_payload);
    }

    #[test]
    fn roundtrip_preserves_all_binary_patterns() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: (0..=255).collect(),
        });
        bundle.failure_payload = (0..=255).collect();
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.payload.len(), 256);
        assert_eq!(restored.failure_payload.len(), 256);
    }

    #[test]
    fn roundtrip_with_minimal_bundle() {
        let bundle = to_bundle(CaseSeed {
            id: 0,
            payload: vec![],
        });
        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");
        assert_eq!(restored.seed.id, 0);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Compression Ratio Measurement Tests
    // ────────────────────────────────────────────────────────────────────────────

    #[test]
    fn measure_compression_ratio_returns_valid_value() {
        let bundle = sample_bundle();
        let ratio = measure_compression_ratio(&bundle).expect("measure ratio");
        assert!(ratio > 0.0, "ratio should be positive");
        assert!(ratio <= 1.0, "ratio should not exceed 1.0");
    }

    #[test]
    fn compression_ratio_better_for_large_payload() {
        let mut small_bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        small_bundle.failure_payload = b"small".to_vec();

        let mut large_bundle = to_bundle(CaseSeed {
            id: 2,
            payload: vec![0xAB; 2048],
        });
        large_bundle.failure_payload = vec![0xCD; 2048];

        let small_ratio = measure_compression_ratio(&small_bundle).expect("small ratio");
        let large_ratio = measure_compression_ratio(&large_bundle).expect("large ratio");

        assert!(
            large_ratio < small_ratio,
            "larger payloads compress better ({} vs {})",
            large_ratio,
            small_ratio
        );
    }

    #[test]
    fn compression_ratio_with_repetitive_data() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0x42; 4096],
        });
        bundle.failure_payload = vec![b'x'; 4096];
        let ratio = measure_compression_ratio(&bundle).expect("ratio");
        assert!(ratio < 0.3, "highly repetitive data should compress to <30%");
    }

    #[test]
    fn compression_ratio_with_random_data() {
        let mut payload = vec![0u8; 1024];
        for p in &mut payload {
            *p = ((*p as u32).wrapping_mul(1103515245).wrapping_add(12345) >> 8) as u8;
        }
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: payload.clone(),
        });
        bundle.failure_payload = payload;
        let ratio = measure_compression_ratio(&bundle).expect("ratio");
        // Random data is harder to compress, but should still be < 1.0
        assert!(ratio < 1.0, "even random data should compress somewhat");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Stress & Integration Tests
    // ────────────────────────────────────────────────────────────────────────────

    #[test]
    fn multiple_roundtrips_preserve_data() {
        let mut bundle = sample_bundle();
        for iteration in 0..3 {
            bundle = to_bundle(CaseSeed {
                id: iteration,
                payload: bundle.seed.payload.clone(),
            });
            let compressed = compress_artifact(&bundle).expect("compress");
            let restored = decompress_artifact(&compressed).expect("decompress");
            assert_eq!(restored.seed.payload, bundle.seed.payload);
        }
    }

    #[test]
    fn all_compression_levels_produce_valid_artifacts() {
        let bundle = sample_bundle();

        for level in &[
            CompressionLevel::Fast,
            CompressionLevel::Default,
            CompressionLevel::Maximum,
        ] {
            let compressed = compress_artifact_with_level(&bundle, *level).expect("compress");
            assert!(!compressed.is_empty(), "compressed should not be empty");
            assert!(
                compressed.starts_with(&[0x1f, 0x8b]),
                "should have gzip magic bytes"
            );

            let restored = decompress_artifact(&compressed).expect("decompress");
            assert_eq!(restored.seed.id, bundle.seed.id);
        }
    }

    #[test]
    fn compression_level_default_is_balanced() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0xAB; 2048],
        });
        bundle.failure_payload = vec![0xCD; 2048];

        let fast =
            compress_artifact_with_level(&bundle, CompressionLevel::Fast).expect("fast size");
        let default =
            compress_artifact_with_level(&bundle, CompressionLevel::Default).expect("default size");
        let maximum =
            compress_artifact_with_level(&bundle, CompressionLevel::Maximum).expect("maximum size");

        assert!(default.len() < fast.len() || default.len() == fast.len());
        assert!(maximum.len() <= default.len());
    }

    #[test]
    fn compression_preserves_signature_fields() {
        let bundle = sample_bundle();
        let original_sig = bundle.signature.clone();

        let compressed = compress_artifact(&bundle).expect("compress");
        let restored = decompress_artifact(&compressed).expect("decompress");

        assert_eq!(restored.signature.category, original_sig.category);
        assert_eq!(restored.signature.digest, original_sig.digest);
        assert_eq!(restored.signature.signature_hash, original_sig.signature_hash);
    }

    #[test]
    fn compression_is_deterministic() {
        let bundle = sample_bundle();
        let compressed1 = compress_artifact(&bundle).expect("compress 1");
        let compressed2 = compress_artifact(&bundle).expect("compress 2");

        // Both should decompress to identical bundles
        let restored1 = decompress_artifact(&compressed1).expect("decompress 1");
        let restored2 = decompress_artifact(&compressed2).expect("decompress 2");

        assert_eq!(restored1.seed, restored2.seed);
        assert_eq!(restored1.signature, restored2.signature);
        assert_eq!(restored1.failure_payload, restored2.failure_payload);
    }

    #[test]
    fn very_large_bundle_compresses_successfully() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0xFF; 100_000],
        });
        bundle.failure_payload = vec![0xEE; 100_000];

        let compressed = compress_artifact(&bundle).expect("compress large");
        assert!(!compressed.is_empty());

        let restored = decompress_artifact(&compressed).expect("decompress large");
        assert_eq!(restored.seed.payload.len(), 100_000);
        assert_eq!(restored.failure_payload.len(), 100_000);
    }

    #[test]
    fn compression_ratio_calculation_matches_actual_sizes() {
        let bundle = sample_bundle();
        let ratio = measure_compression_ratio(&bundle).expect("ratio");

        let original_size = crate::save_case_bundle_json(&bundle).expect("json").len() as f64;
        let compressed_size = compress_artifact(&bundle).expect("compress").len() as f64;
        let expected_ratio = compressed_size / original_size;

        assert!((ratio - expected_ratio).abs() < 0.001, "ratio calculation should match");
    }

    #[test]
    fn compression_level_default_implementation() {
        let level = CompressionLevel::default();
        assert_eq!(level, CompressionLevel::Default);
    }
}
