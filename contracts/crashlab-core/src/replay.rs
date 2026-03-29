use crate::{classify, signatures_match, CaseBundle, CrashSignature};

/// Replay outcome for a single persisted seed bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayResult {
    pub expected: CrashSignature,
    pub actual: CrashSignature,
    pub matches: bool,
}

/// Re-runs classification from the bundle seed and compares signatures.
pub fn replay_seed_bundle(bundle: &CaseBundle) -> ReplayResult {
    let actual = classify(&bundle.seed);
    let expected = bundle.signature.clone();
    let matches = signatures_match(&expected, &actual);
    ReplayResult {
        expected,
        actual,
        matches,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, CaseSeed};

    #[test]
    fn replay_matches_original_bundle_signature() {
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        });
        let result = replay_seed_bundle(&bundle);
        assert!(result.matches);
        assert_eq!(result.expected, result.actual);
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
        assert_ne!(result.expected, result.actual);
    }
}
