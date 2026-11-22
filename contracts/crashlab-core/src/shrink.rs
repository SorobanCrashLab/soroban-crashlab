//! Signature-preserving reproducer shrinking (delta debugging over payload bytes).
//!
//! [`shrink_payload`] runs ddmin (Zeller, 2002) over the bytes of a failing
//! payload. The caller supplies a `check` closure that returns `true` when a
//! candidate still reproduces the target signature. [`preserve_check`] builds
//! that decision from two [`CrashSignature`] values under a [`PreserveMode`].
//!
//! Guarantees:
//! - **Deterministic**: the same payload and check always yield the same result.
//! - **Never accepts a rejected candidate**: a candidate becomes the working
//!   payload only when `check` returns `true`. If the original payload is itself
//!   rejected, it is returned unchanged.
//! - **Bounded**: [`ShrinkBudget`] counts `check` invocations. It is
//!   iteration-only on purpose. A wall-clock budget would make results depend on
//!   machine speed, so it is not offered.
//! - **1-minimal** when the budget is not exhausted: no single byte can be
//!   removed from the result while `check` still returns `true`.

use crate::{signatures_match, CrashSignature};
use serde::{Deserialize, Serialize};

/// Iteration budget for [`shrink_payload`].
///
/// `max_iterations` caps the number of `check` invocations, including the
/// initial check of the original payload. A budget of `0` returns the original
/// payload immediately with `budget_exhausted` set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShrinkBudget {
    pub max_iterations: u32,
}

impl ShrinkBudget {
    /// Creates an iteration-only budget.
    pub fn new(max_iterations: u32) -> Self {
        Self { max_iterations }
    }
}

/// Result of [`shrink_payload`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShrinkOutcome {
    /// Smallest payload found that `check` accepted (the original if nothing smaller was accepted).
    pub payload: Vec<u8>,
    /// Number of `check` invocations performed.
    pub iterations: u32,
    /// `true` when `payload` is strictly shorter than the original.
    pub reduced: bool,
    /// `true` when the search stopped because `max_iterations` was reached.
    pub budget_exhausted: bool,
}

/// How strictly a shrunk candidate must match the original signature.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreserveMode {
    /// Only the failure category (class) must match. Digest and signature hash
    /// may differ. Use this when a shrink is allowed to land on a different
    /// variant of the same failure class.
    SignatureClass,
    /// Category, digest, and signature hash must all match
    /// (see [`crate::signatures_match`]). This is the default for fixtures.
    FullSignature,
}

/// Decides whether a candidate's signature still counts as reproducing `original`.
///
/// Reuses the crate's existing comparison ([`signatures_match`]) for
/// [`PreserveMode::FullSignature`]. Hashing is not reimplemented here.
pub fn preserve_check(
    mode: PreserveMode,
    original: &CrashSignature,
    candidate: &CrashSignature,
) -> bool {
    match mode {
        PreserveMode::SignatureClass => original.category == candidate.category,
        PreserveMode::FullSignature => signatures_match(original, candidate),
    }
}

/// Budget-tracking wrapper around the caller's `check` closure.
struct Oracle<'a, F>
where
    F: FnMut(&[u8]) -> bool,
{
    check: &'a mut F,
    max: u32,
    used: u32,
    exhausted: bool,
}

impl<'a, F> Oracle<'a, F>
where
    F: FnMut(&[u8]) -> bool,
{
    /// Runs `check` on `candidate`. Returns `None` when the budget is spent.
    fn accepts(&mut self, candidate: &[u8]) -> Option<bool> {
        if self.used >= self.max {
            self.exhausted = true;
            return None;
        }
        self.used += 1;
        Some((*self.check)(candidate))
    }
}

/// Shrinks `payload` with ddmin while `check` keeps returning `true`.
///
/// `check` must return `true` when the reduced input still reproduces the
/// target signature. The original payload is checked first. If it is rejected,
/// it is returned unchanged with `reduced == false`.
pub fn shrink_payload<F>(payload: &[u8], budget: ShrinkBudget, mut check: F) -> ShrinkOutcome
where
    F: FnMut(&[u8]) -> bool,
{
    let original_len = payload.len();
    let mut oracle = Oracle {
        check: &mut check,
        max: budget.max_iterations,
        used: 0,
        exhausted: false,
    };
    let mut current = payload.to_vec();

    // The original must reproduce; otherwise there is nothing to preserve.
    if oracle.accepts(&current) != Some(true) {
        return ShrinkOutcome {
            payload: current,
            iterations: oracle.used,
            reduced: false,
            budget_exhausted: oracle.exhausted,
        };
    }

    // ddmin over complements: split into `parts` chunks, try removing each one,
    // and refine the granularity when no removal succeeds.
    let mut granularity: usize = 2;
    'search: while current.len() >= 2 {
        let parts = granularity.min(current.len());
        let mut reduced_round = false;

        for part in 0..parts {
            let start = part * current.len() / parts;
            let end = (part + 1) * current.len() / parts;

            let mut candidate = Vec::with_capacity(current.len() - (end - start));
            candidate.extend_from_slice(&current[..start]);
            candidate.extend_from_slice(&current[end..]);

            match oracle.accepts(&candidate) {
                None => break 'search,
                Some(true) => {
                    current = candidate;
                    granularity = parts.saturating_sub(1).max(2);
                    reduced_round = true;
                    break;
                }
                Some(false) => {}
            }
        }

        if !reduced_round {
            // Single-byte removals were all tried and rejected: 1-minimal.
            if parts >= current.len() {
                break;
            }
            granularity = (parts * 2).min(current.len());
        }
    }

    let reduced = current.len() < original_len;
    ShrinkOutcome {
        payload: current,
        iterations: oracle.used,
        reduced,
        budget_exhausted: oracle.exhausted,
    }
}

/// Provenance of a shrunk fixture: where it came from and how much was removed.
///
/// `shrunk_from` is the original fixture id or content hash (the caller chooses
/// which). The record is serde-serializable with the same derive pattern as
/// the other provenance types in this crate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShrunkFixtureProvenance {
    /// Original fixture id or content hash.
    pub shrunk_from: String,
    /// Check invocations used to produce the shrunk payload.
    pub iterations: u32,
    /// Original payload length in bytes.
    pub original_len: usize,
    /// Shrunk payload length in bytes.
    pub shrunk_len: usize,
}

impl ShrunkFixtureProvenance {
    /// Builds provenance from a [`ShrinkOutcome`].
    ///
    /// `original_len` is passed explicitly because [`ShrinkOutcome`] does not
    /// record the original payload size.
    pub fn from_outcome(
        shrunk_from: impl Into<String>,
        original_len: usize,
        outcome: &ShrinkOutcome,
    ) -> Self {
        Self {
            shrunk_from: shrunk_from.into(),
            iterations: outcome.iterations,
            original_len,
            shrunk_len: outcome.payload.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// True when `needle` occurs in `haystack` as a subsequence (order preserved).
    fn contains_subsequence(haystack: &[u8], needle: &[u8]) -> bool {
        let mut it = haystack.iter();
        needle.iter().all(|n| it.any(|h| h == n))
    }

    fn sig(category: &str, digest: u64, hash: u64) -> CrashSignature {
        CrashSignature {
            category: category.to_string(),
            digest,
            signature_hash: hash,
        }
    }

    const BIG: u32 = 100_000;

    #[test]
    fn bloated_payload_shrinks_to_minimal_pair() {
        let mut payload = vec![0u8; 64];
        payload[10] = 0xAA;
        payload[40] = 0xBB;

        let outcome = shrink_payload(&payload, ShrinkBudget::new(BIG), |c: &[u8]| {
            contains_subsequence(c, &[0xAA, 0xBB])
        });

        assert_eq!(outcome.payload, vec![0xAA, 0xBB]);
        assert!(outcome.reduced);
        assert!(!outcome.budget_exhausted);
        assert!(outcome.iterations > 0);
    }

    #[test]
    fn never_satisfied_check_returns_original_unchanged() {
        let payload: Vec<u8> = (0..16).collect();
        let outcome = shrink_payload(&payload, ShrinkBudget::new(BIG), |_: &[u8]| false);

        assert_eq!(outcome.payload, payload);
        assert!(!outcome.reduced);
        assert!(!outcome.budget_exhausted);
        assert_eq!(outcome.iterations, 1);
    }

    #[test]
    fn budget_of_one_sets_budget_exhausted() {
        let mut payload = vec![0u8; 32];
        payload[3] = 0xAA;
        payload[20] = 0xBB;
        let check = |c: &[u8]| contains_subsequence(c, &[0xAA, 0xBB]);

        let outcome = shrink_payload(&payload, ShrinkBudget::new(1), check);

        assert!(outcome.budget_exhausted);
        assert_eq!(outcome.iterations, 1);
        assert!(!outcome.reduced);
        assert!(check(&outcome.payload));
    }

    #[test]
    fn zero_budget_returns_original_and_flags_exhaustion() {
        let payload = vec![1u8, 2, 3];
        let outcome = shrink_payload(&payload, ShrinkBudget::new(0), |_: &[u8]| true);

        assert_eq!(outcome.payload, payload);
        assert!(outcome.budget_exhausted);
        assert_eq!(outcome.iterations, 0);
    }

    #[test]
    fn output_always_satisfies_check() {
        for len in [2usize, 3, 7, 16, 33, 64] {
            for i in 0..len {
                for j in (i + 1)..len {
                    let mut payload = vec![0u8; len];
                    payload[i] = 0xAA;
                    payload[j] = 0xBB;
                    let check = |c: &[u8]| contains_subsequence(c, &[0xAA, 0xBB]);

                    let outcome = shrink_payload(&payload, ShrinkBudget::new(BIG), check);

                    assert!(
                        check(&outcome.payload),
                        "shrunk payload rejected by check (len={len}, i={i}, j={j})"
                    );
                    assert_eq!(outcome.payload, vec![0xAA, 0xBB]);
                }
            }
        }
    }

    #[test]
    fn shrinking_is_deterministic() {
        let payload: Vec<u8> = (0..50u8).map(|b| b.wrapping_mul(7)).collect();
        let check = |c: &[u8]| c.iter().filter(|&&b| b % 5 == 0).count() >= 3;

        let a = shrink_payload(&payload, ShrinkBudget::new(BIG), check);
        let b = shrink_payload(&payload, ShrinkBudget::new(BIG), check);

        assert_eq!(a, b);
        assert!(check(&a.payload));
    }

    #[test]
    fn empty_payload_is_returned_when_accepted() {
        let outcome = shrink_payload(&[], ShrinkBudget::new(BIG), |_: &[u8]| true);
        assert!(outcome.payload.is_empty());
        assert!(!outcome.reduced);
    }

    #[test]
    fn preserve_class_ignores_digest_and_hash() {
        let original = sig("runtime-failure", 1, 2);
        let candidate = sig("runtime-failure", 9, 9);
        assert!(preserve_check(
            PreserveMode::SignatureClass,
            &original,
            &candidate
        ));
        assert!(!preserve_check(
            PreserveMode::FullSignature,
            &original,
            &candidate
        ));
    }

    #[test]
    fn preserve_class_rejects_different_category() {
        let original = sig("auth", 1, 2);
        let candidate = sig("budget", 1, 2);
        assert!(!preserve_check(
            PreserveMode::SignatureClass,
            &original,
            &candidate
        ));
        assert!(!preserve_check(
            PreserveMode::FullSignature,
            &original,
            &candidate
        ));
    }

    #[test]
    fn full_signature_accepts_identical_signature() {
        let original = sig("state", 5, 6);
        assert!(preserve_check(
            PreserveMode::FullSignature,
            &original,
            &original.clone()
        ));
    }

    #[test]
    fn provenance_from_outcome_records_delta() {
        let outcome = ShrinkOutcome {
            payload: vec![0xAA, 0xBB],
            iterations: 42,
            reduced: true,
            budget_exhausted: false,
        };
        let prov = ShrunkFixtureProvenance::from_outcome("fixture-a", 64, &outcome);
        assert_eq!(prov.shrunk_from, "fixture-a");
        assert_eq!(prov.iterations, 42);
        assert_eq!(prov.original_len, 64);
        assert_eq!(prov.shrunk_len, 2);
    }

    #[test]
    fn provenance_json_roundtrip() {
        let prov = ShrunkFixtureProvenance {
            shrunk_from: "sha256:abc".to_string(),
            iterations: 7,
            original_len: 10,
            shrunk_len: 2,
        };
        let json = serde_json::to_string(&prov).unwrap();
        let back: ShrunkFixtureProvenance = serde_json::from_str(&json).unwrap();
        assert_eq!(back, prov);
    }
}
