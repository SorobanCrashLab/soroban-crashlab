//! Gzip compression for failure artifacts.
//!
//! Wraps the JSON bytes produced by [`bundle_persist`](crate::bundle_persist) in
//! gzip so long campaigns store significantly less data on disk while keeping
//! artifacts fully reproducible (decompress → load → verify signature).

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};

use crate::bundle_persist::load_case_bundle_json;
use crate::{save_case_bundle_json, BundlePersistError, CaseBundle};

/// Compresses `bundle` to gzip-wrapped JSON bytes.
///
/// The returned bytes can be stored directly to disk and later restored with
/// [`decompress_artifact`].
pub fn compress_artifact(bundle: &CaseBundle) -> Result<Vec<u8>, BundlePersistError> {
    let json = save_case_bundle_json(bundle)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&json)?;
    Ok(encoder.finish()?)
}

/// Decompresses gzip bytes produced by [`compress_artifact`] back into a
/// [`CaseBundle`], validating the bundle schema on the way out.
pub fn decompress_artifact(compressed: &[u8]) -> Result<CaseBundle, BundlePersistError> {
    let mut decoder = GzDecoder::new(compressed);
    let mut json = Vec::new();
    decoder.read_to_end(&mut json)?;
    load_case_bundle_json(&json)
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
    fn corrupt_bytes_return_error() {
        let result = decompress_artifact(b"not-gzip-data");
        assert!(result.is_err());
    }
}
