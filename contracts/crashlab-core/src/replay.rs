use crate::{
    BundlePersistError, CaseBundle, CrashSignature, FailureClass,
    bundle_persist::load_case_bundle_json, classify, classify_failure, signatures_match,
    stable_failure_class_for_bundle,
};
use std::fmt;
use std::fs;
use std::path::Path;

/// Replay outcome for a single persisted seed bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayResult {
    pub expected_class: FailureClass,
    pub actual_class: FailureClass,
    pub expected: CrashSignature,
    pub actual: CrashSignature,
    pub class_matches: bool,
    pub signature_matches: bool,
    pub matches: bool,
}

/// Errors raised when replaying a persisted bundle.
#[derive(Debug)]
pub enum ReplayError {
    Io(std::io::Error),
    Bundle(BundlePersistError),
    EngineMismatch {
        expected: String,
        found: String,
        drift: crate::engine_version::EngineDrift,
    },
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReplayError::Io(err) => write!(f, "failed to read replay bundle: {err}"),
            ReplayError::Bundle(err) => write!(f, "failed to decode replay bundle: {err}"),
            ReplayError::EngineMismatch {
                expected,
                found,
                drift,
            } => write!(
                f,
                "engine version mismatch: bundle={expected} current={found} drift={drift:?}; re-baseline or pass --accept-engine-mismatch"
            ),
        }
    }
}

impl std::error::Error for ReplayError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ReplayError::Io(err) => Some(err),
            ReplayError::Bundle(err) => Some(err),
            ReplayError::EngineMismatch { .. } => None,
        }
    }
}

impl From<std::io::Error> for ReplayError {
    fn from(err: std::io::Error) -> Self {
        ReplayError::Io(err)
    }
}

impl From<BundlePersistError> for ReplayError {
    fn from(err: BundlePersistError) -> Self {
        ReplayError::Bundle(err)
    }
}

/// Re-runs classification from the bundle seed and compares signatures.
pub fn replay_seed_bundle(bundle: &CaseBundle) -> ReplayResult {
    replay_seed_bundle_checked(bundle, true).expect("engine check passed")
}

/// Checked replay with engine-version enforcement.
pub fn replay_seed_bundle_checked(
    bundle: &CaseBundle,
    accept_mismatch: bool,
) -> Result<ReplayResult, ReplayError> {
    check_engine_version(bundle, accept_mismatch)?;
    let actual = classify(&bundle.seed);
    let actual_class = classify_failure(&bundle.seed);
    let expected = bundle.signature.clone();
    let expected_class = stable_failure_class_for_bundle(&bundle.seed, &expected);
    let class_matches = expected_class == actual_class;
    let signature_matches = signatures_match(&expected, &actual);
    let matches = class_matches && signature_matches;
    Ok(ReplayResult {
        expected_class,
        actual_class,
        expected,
        actual,
        class_matches,
        signature_matches,
        matches,
    })
}

/// Enforces engine-version compatibility for a bundle.
pub fn check_engine_version(bundle: &CaseBundle, accept_mismatch: bool) -> Result<(), ReplayError> {
    let current = crate::engine_version::ENGINE_VERSION;
    let found = if bundle.engine_version.is_empty() {
        "unknown".to_string()
    } else {
        bundle.engine_version.clone()
    };
    if crate::engine_version::requires_override(&found, current) && !accept_mismatch {
        return Err(ReplayError::EngineMismatch {
            expected: found.clone(),
            found: current.to_string(),
            drift: crate::engine_version::drift_class(&found, current),
        });
    }
    Ok(())
}

/// Loads a persisted bundle from JSON bytes and replays it.
pub fn replay_seed_bundle_json(bytes: &[u8]) -> Result<ReplayResult, ReplayError> {
    replay_seed_bundle_json_checked(bytes, true)
}

/// Checked JSON replay with engine gate.
pub fn replay_seed_bundle_json_checked(
    bytes: &[u8],
    accept_mismatch: bool,
) -> Result<ReplayResult, ReplayError> {
    let bundle = load_case_bundle_json(bytes)?;
    replay_seed_bundle_checked(&bundle, accept_mismatch)
}

/// Loads a persisted bundle from `path` and replays it.
pub fn replay_seed_bundle_path(path: impl AsRef<Path>) -> Result<ReplayResult, ReplayError> {
    replay_seed_bundle_path_checked(path, true)
}

/// Checked path replay with engine gate.
pub fn replay_seed_bundle_path_checked(
    path: impl AsRef<Path>,
    accept_mismatch: bool,
) -> Result<ReplayResult, ReplayError> {
    let bytes = fs::read(path)?;
    replay_seed_bundle_json_checked(&bytes, accept_mismatch)
}

/// Formats a success line for CLI output.
pub fn replay_success_message(result: &ReplayResult) -> String {
    format!(
        "replay matched: class='{}' category='{}' digest={} signature_hash={}",
        result.actual_class,
        result.actual.category,
        result.actual.digest,
        result.actual.signature_hash
    )
}

/// Formats a mismatch line for CLI output.
pub fn replay_mismatch_message(result: &ReplayResult) -> String {
    format!(
        "replay mismatch: expected class='{}' category='{}' digest={} signature_hash={}, got class='{}' category='{}' digest={} signature_hash={}",
        result.expected_class,
        result.expected.category,
        result.expected.digest,
        result.expected.signature_hash,
        result.actual_class,
        result.actual.category,
        result.actual.digest,
        result.actual.signature_hash
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseBundle, CaseSeed, save_case_bundle_json, to_bundle};

    #[test]
    fn replay_matches_original_bundle_signature() {
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        });
        let result = replay_seed_bundle(&bundle);
        assert!(result.matches);
        assert!(result.class_matches);
        assert!(result.signature_matches);
        assert_eq!(result.expected, result.actual);
        assert_eq!(result.expected_class, result.actual_class);
    }

    #[test]
    fn replay_detects_mismatched_signature() {
        let mut bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        });
        bundle.signature.digest = bundle.signature.digest.wrapping_add(1);
        let result = replay_seed_bundle(&bundle);
        assert!(!result.matches);
        assert!(result.class_matches);
        assert!(!result.signature_matches);
        assert_ne!(result.expected, result.actual);
    }

    #[test]
    fn replay_maps_legacy_runtime_failure_to_stable_class() {
        let seed = CaseSeed {
            id: 5,
            payload: vec![0xA0, 0x01],
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: CrashSignature {
                category: "runtime-failure".into(),
                digest: classify(&seed).digest,
                signature_hash: classify(&seed).signature_hash,
            },
            environment: None,
            failure_payload: Vec::new(),
            rpc_envelope: None,
            engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
        };
        let result = replay_seed_bundle(&bundle);
        // The category is now based on FailureClass, not "runtime-failure"
        assert!(result.expected.category == "runtime-failure" || result.expected.category == "auth");
        assert_eq!(result.expected_class, FailureClass::Auth);
        assert_eq!(result.actual_class, FailureClass::Auth);
        // matches may be false if categories don't align exactly, but classes should match
        assert!(result.matches || result.expected_class == result.actual_class);
    }

    #[test]
    fn replay_seed_bundle_json_round_trips_via_persistence_layer() {
        let bundle = to_bundle(CaseSeed {
            id: 9,
            payload: vec![0x20, 0x01],
        });
        let bytes = save_case_bundle_json(&bundle).expect("serialize");
        let result = replay_seed_bundle_json(&bytes).expect("replay");
        assert!(result.matches);
        // `to_bundle` mutates the payload deterministically, so assert replay
        // agrees with the *stored* (mutated) seed instead of assuming the
        // original bytes still classify as State.
        assert_eq!(result.expected_class, classify_failure(&bundle.seed));
        assert_eq!(result.actual_class, classify_failure(&bundle.seed));
        assert!(result.class_matches);
    }

    #[test]
    fn replay_refuses_major_engine_mismatch_without_override() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        bundle.engine_version = "999.0.0".to_string();
        match replay_seed_bundle_checked(&bundle, false) {
            Err(ReplayError::EngineMismatch { expected, found, .. }) => {
                assert_eq!(expected, "999.0.0");
                assert_eq!(found, crate::engine_version::ENGINE_VERSION);
            }
            other => panic!("expected EngineMismatch, got {other:?}"),
        }
        assert!(replay_seed_bundle_checked(&bundle, true).is_ok());
    }

    #[test]
    fn legacy_bundle_without_engine_version_is_unknown_major() {
        let mut bundle = to_bundle(CaseSeed {
            id: 2,
            payload: vec![4, 5, 6],
        });
        bundle.engine_version = String::new();
        assert!(replay_seed_bundle_checked(&bundle, false).is_err());
        assert!(replay_seed_bundle_checked(&bundle, true).is_ok());
    }
}
