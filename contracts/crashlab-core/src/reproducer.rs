use crate::retry::{execute_with_retry, RetryConfig, SimulationError};
use crate::{CaseBundle, CaseSeed, CrashSignature};

/// Summary of stability analysis for a single [`CaseBundle`].
///
/// A bundle is considered *stable* when its [`flake_rate`][Self::flake_rate]
/// is at or below the [`FlakyDetector::threshold`] that produced this report.
/// Unstable bundles should be quarantined and excluded from CI regression packs.
#[derive(Debug, Clone)]
pub struct ReproReport {
    /// The bundle that was analysed.
    pub bundle: CaseBundle,
    /// Total number of re-execution attempts performed.
    pub runs: u32,
    /// Number of runs whose signature matched the reference in `bundle.signature`.
    pub stable_count: u32,
    /// Fraction of runs that diverged from the reference: `(runs - stable_count) / runs`.
    ///
    /// `0.0` — perfectly deterministic; `1.0` — never reproduced.
    pub flake_rate: f64,
    /// `true` when `flake_rate <= FlakyDetector::threshold`.
    ///
    /// Only stable bundles should be included in a CI regression pack.
    pub is_stable: bool,
}

/// Detects non-deterministic reproducer cases by re-executing them under a
/// caller-supplied function and comparing each result to the reference
/// signature stored in the [`CaseBundle`].
///
/// # Example
///
/// ```rust
/// use crashlab_core::{to_bundle, CaseSeed};
/// use crashlab_core::reproducer::FlakyDetector;
///
/// let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1, 2, 3] });
/// let detector = FlakyDetector::new(10, 0.1);
///
/// // In a real integration this closure invokes the contract under test.
/// let report = detector.check(&bundle, |_seed| Ok(bundle.signature.clone())).unwrap();
/// assert!(report.is_stable);
/// ```
#[derive(Debug, Clone)]
pub struct FlakyDetector {
    /// Number of re-execution attempts per bundle.
    pub runs: u32,
    /// Maximum tolerated flake rate in `[0.0, 1.0]`.
    ///
    /// Bundles whose `flake_rate` exceeds this value are marked `is_stable: false`.
    pub threshold: f64,
}

impl FlakyDetector {
    /// Creates a new detector.
    ///
    /// # Panics
    ///
    /// Panics if `runs == 0` or `threshold` is outside `[0.0, 1.0]`.
    pub fn new(runs: u32, threshold: f64) -> Self {
        assert!(runs > 0, "runs must be >= 1");
        assert!(
            (0.0..=1.0).contains(&threshold),
            "threshold must be in [0.0, 1.0]"
        );
        Self { runs, threshold }
    }

    /// Re-runs `reproducer` on the bundle's seed `self.runs` times.
    ///
    /// Each invocation's returned [`CrashSignature`] is compared to
    /// `bundle.signature`.  The resulting [`ReproReport`] captures the flake
    /// rate and stability verdict.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] if a run fails after all retry attempts or
    /// if a non-transient error is encountered.
    pub fn check<F>(
        &self,
        bundle: &CaseBundle,
        mut reproducer: F,
    ) -> Result<ReproReport, SimulationError>
    where
        F: FnMut(&CaseSeed) -> Result<CrashSignature, SimulationError>,
    {
        let config = RetryConfig::default();
        let mut stable_count = 0;

        for _ in 0..self.runs {
            let signature = execute_with_retry(&config, None, || reproducer(&bundle.seed))?;
            if signature == bundle.signature {
                stable_count += 1;
            }
        }

        let flake_rate = (self.runs - stable_count) as f64 / self.runs as f64;

        Ok(ReproReport {
            bundle: bundle.clone(),
            runs: self.runs,
            stable_count,
            flake_rate,
            is_stable: flake_rate <= self.threshold,
        })
    }
}

/// Filters `bundles` down to those that are stable enough for a CI regression pack.
///
/// Each bundle is evaluated with `detector`.  Any bundle whose flake rate exceeds
/// `detector.threshold` is excluded from the returned collection.
///
/// # Errors
///
/// Returns [`SimulationError`] if any bundle fails evaluation after all retry
/// attempts or if a non-transient error is encountered.
pub fn filter_ci_pack<'a, F>(
    bundles: &'a [CaseBundle],
    detector: &FlakyDetector,
    mut reproducer: F,
) -> Result<Vec<&'a CaseBundle>, SimulationError>
where
    F: FnMut(&CaseSeed) -> Result<CrashSignature, SimulationError>,
{
    let mut stable_bundles = Vec::new();
    for bundle in bundles {
        if detector.check(bundle, &mut reproducer)?.is_stable {
            stable_bundles.push(bundle);
        }
    }
    Ok(stable_bundles)
}

/// Shrinks a failing seed by removing payload chunks while preserving `expected`.
///
/// The algorithm is deterministic and greedily accepts removals that still
/// reproduce the same signature. It progressively decreases chunk size until no
/// single-byte removal can be applied.
pub fn shrink_seed_preserving_signature<F>(
    seed: &CaseSeed,
    expected: &CrashSignature,
    mut reproducer: F,
) -> Result<CaseSeed, SimulationError>
where
    F: FnMut(&CaseSeed) -> Result<CrashSignature, SimulationError>,
{
    let config = RetryConfig::default();
    let mut best = seed.clone();
    if best.payload.is_empty() {
        return Ok(best);
    }

    let mut chunk = (best.payload.len() / 2).max(1);
    loop {
        let mut improved = false;
        let mut start = 0usize;

        while start < best.payload.len() {
            let end = (start + chunk).min(best.payload.len());
            if end <= start {
                break;
            }

            let mut candidate = best.clone();
            candidate.payload.drain(start..end);

            let sig = execute_with_retry(&config, None, || reproducer(&candidate))?;
            if sig == *expected {
                best = candidate;
                improved = true;
                // Retry at same index because the payload shifted left.
                continue;
            }

            start += 1;
        }

        if !improved {
            if chunk == 1 {
                break;
            }
            chunk /= 2;
            continue;
        }

        if best.payload.len() <= 1 {
            break;
        }

        if chunk > best.payload.len() {
            chunk = (best.payload.len() / 2).max(1);
        }
    }

    Ok(best)
}

/// Shrinks only the seed payload inside a failing bundle while preserving the
/// bundle's reference signature.
///
/// # Errors
///
/// Returns [`SimulationError`] if a run fails after all retry attempts or
/// if a non-transient error is encountered.
pub fn shrink_bundle_payload<F>(
    bundle: &CaseBundle,
    reproducer: F,
) -> Result<CaseBundle, SimulationError>
where
    F: FnMut(&CaseSeed) -> Result<CrashSignature, SimulationError>,
{
    let mut shrunk = bundle.clone();
    shrunk.seed = shrink_seed_preserving_signature(&bundle.seed, &bundle.signature, reproducer)?;
    Ok(shrunk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, CaseSeed, CrashSignature};
    use std::cell::Cell;

    fn make_bundle(id: u64, payload: Vec<u8>) -> CaseBundle {
        to_bundle(CaseSeed { id, payload })
    }

    fn divergent_sig() -> CrashSignature {
        CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 0xDEAD_BEEF,
            signature_hash: 0xDEAD_BEEF_CAFE_0000,
        }
    }

    // ── FlakyDetector::check ──────────────────────────────────────────────────

    #[test]
    fn perfectly_stable_reproducer_has_zero_flake_rate() {
        let bundle = make_bundle(1, vec![1, 2, 3]);
        let detector = FlakyDetector::new(10, 0.0);

        let report = detector
            .check(&bundle, |_| Ok(bundle.signature.clone()))
            .unwrap();

        assert_eq!(report.runs, 10);
        assert_eq!(report.stable_count, 10);
        assert_eq!(report.flake_rate, 0.0);
        assert!(report.is_stable);
    }

    #[test]
    fn always_diverging_reproducer_has_full_flake_rate() {
        let bundle = make_bundle(2, vec![5, 6, 7]);
        let detector = FlakyDetector::new(8, 0.5);

        let report = detector.check(&bundle, |_| Ok(divergent_sig())).unwrap();

        assert_eq!(report.stable_count, 0);
        assert_eq!(report.flake_rate, 1.0);
        assert!(!report.is_stable);
    }

    #[test]
    fn alternating_reproducer_yields_fifty_percent_flake_rate() {
        let bundle = make_bundle(3, vec![0xAA, 0xBB]);
        // Threshold of 0.6 so a 0.5 flake rate still passes.
        let detector = FlakyDetector::new(4, 0.6);
        let counter = Cell::new(0u32);

        let report = detector
            .check(&bundle, |_| {
                let n = counter.get();
                counter.set(n + 1);
                // Even calls reproduce correctly; odd calls diverge → 2/4 stable.
                if n % 2 == 0 {
                    Ok(bundle.signature.clone())
                } else {
                    Ok(divergent_sig())
                }
            })
            .unwrap();

        assert_eq!(report.stable_count, 2);
        assert!((report.flake_rate - 0.5).abs() < f64::EPSILON);
        assert!(report.is_stable);
    }

    #[test]
    fn flake_rate_equal_to_threshold_is_stable() {
        // 3 out of 10 runs diverge → flake_rate == 0.3 == threshold → stable.
        let bundle = make_bundle(4, vec![1]);
        let detector = FlakyDetector::new(10, 0.3);
        let counter = Cell::new(0u32);

        let report = detector
            .check(&bundle, |_| {
                let n = counter.get();
                counter.set(n + 1);
                if n < 7 {
                    Ok(bundle.signature.clone())
                } else {
                    Ok(divergent_sig())
                }
            })
            .unwrap();

        assert_eq!(report.stable_count, 7);
        assert!((report.flake_rate - 0.3).abs() < f64::EPSILON);
        assert!(report.is_stable);
    }

    #[test]
    fn flake_rate_above_threshold_marks_bundle_unstable() {
        // 4 out of 10 runs diverge → flake_rate == 0.4 > 0.2 threshold → unstable.
        let bundle = make_bundle(5, vec![2, 3]);
        let detector = FlakyDetector::new(10, 0.2);
        let counter = Cell::new(0u32);

        let report = detector
            .check(&bundle, |_| {
                let n = counter.get();
                counter.set(n + 1);
                if n < 6 {
                    Ok(bundle.signature.clone())
                } else {
                    Ok(divergent_sig())
                }
            })
            .unwrap();

        assert_eq!(report.stable_count, 6);
        assert!(!report.is_stable);
    }

    #[test]
    fn check_retries_on_transient_error() {
        let bundle = make_bundle(6, vec![1]);
        let detector = FlakyDetector::new(2, 0.0);
        let counter = Cell::new(0u32);

        let report = detector
            .check(&bundle, |_| {
                let n = counter.get();
                counter.set(n + 1);
                // Fail first two attempts of the first run
                if n < 2 {
                    Err(SimulationError::Transient("rpc timeout".to_string()))
                } else {
                    Ok(bundle.signature.clone())
                }
            })
            .unwrap();

        assert_eq!(report.stable_count, 2);
        assert_eq!(counter.get(), 4); // 1st run: 3 attempts (2 fail, 1 success), 2nd run: 1 attempt
    }

    // ── filter_ci_pack ────────────────────────────────────────────────────────

    #[test]
    fn filter_ci_pack_excludes_flaky_bundle() {
        let stable = make_bundle(10, vec![1, 2]);
        let flaky = make_bundle(11, vec![3, 4]);

        let stable_sig = stable.signature.clone();
        let stable_id = stable.seed.id;

        let bundles = vec![stable, flaky];
        let detector = FlakyDetector::new(5, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, move |seed| {
            if seed.id == stable_id {
                Ok(stable_sig.clone())
            } else {
                Ok(divergent_sig())
            }
        })
        .unwrap();

        assert_eq!(pack.len(), 1);
        assert_eq!(pack[0].seed.id, stable_id);
    }

    #[test]
    fn filter_ci_pack_retains_all_stable_bundles() {
        let b1 = make_bundle(20, vec![1]);
        let b2 = make_bundle(21, vec![2]);

        let sig1 = b1.signature.clone();
        let sig2 = b2.signature.clone();
        let id1 = b1.seed.id;

        let bundles = vec![b1, b2];
        let detector = FlakyDetector::new(3, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, move |seed| {
            if seed.id == id1 {
                Ok(sig1.clone())
            } else {
                Ok(sig2.clone())
            }
        })
        .unwrap();

        assert_eq!(pack.len(), 2);
    }

    #[test]
    fn filter_ci_pack_returns_empty_when_all_bundles_are_flaky() {
        let b1 = make_bundle(30, vec![0xFF]);
        let b2 = make_bundle(31, vec![0xFE]);
        let bundles = vec![b1, b2];
        let detector = FlakyDetector::new(4, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, |_| Ok(divergent_sig())).unwrap();

        assert!(pack.is_empty());
    }

    // ── constructor guards ────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "runs must be >= 1")]
    fn detector_panics_on_zero_runs() {
        FlakyDetector::new(0, 0.5);
    }

    #[test]
    #[should_panic(expected = "threshold must be in [0.0, 1.0]")]
    fn detector_panics_on_threshold_above_one() {
        FlakyDetector::new(5, 1.1);
    }

    #[test]
    #[should_panic(expected = "threshold must be in [0.0, 1.0]")]
    fn detector_panics_on_negative_threshold() {
        FlakyDetector::new(5, -0.1);
    }

    // ── shrinking ─────────────────────────────────────────────────────────────

    fn anchor_signature(seed: &CaseSeed) -> Result<CrashSignature, SimulationError> {
        let has_anchor = seed.payload.windows(2).any(|w| w == [0xAA, 0xBB]);
        if has_anchor {
            Ok(CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 0x1234,
                signature_hash: 0x7777,
            })
        } else {
            Ok(CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 0x9999,
                signature_hash: 0xEEEE,
            })
        }
    }

    #[test]
    fn shrink_seed_reduces_size_and_preserves_signature() {
        let seed = CaseSeed {
            id: 77,
            payload: vec![0, 1, 2, 0xAA, 0xBB, 3, 4, 5, 6],
        };
        let expected = anchor_signature(&seed).unwrap();

        let shrunk = shrink_seed_preserving_signature(&seed, &expected, anchor_signature).unwrap();

        assert!(shrunk.payload.len() < seed.payload.len());
        assert_eq!(anchor_signature(&shrunk).unwrap(), expected);
    }

    #[test]
    fn shrink_seed_keeps_minimal_reproducer_unchanged() {
        let seed = CaseSeed {
            id: 88,
            payload: vec![0xAA, 0xBB],
        };
        let expected = anchor_signature(&seed).unwrap();

        let shrunk = shrink_seed_preserving_signature(&seed, &expected, anchor_signature).unwrap();

        assert_eq!(shrunk.payload, seed.payload);
        assert_eq!(anchor_signature(&shrunk).unwrap(), expected);
    }

    #[test]
    fn shrink_bundle_payload_preserves_bundle_signature() {
        let seed = CaseSeed {
            id: 42,
            payload: vec![9, 9, 0xAA, 0xBB, 9, 9],
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: anchor_signature(&seed).unwrap(),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let shrunk = shrink_bundle_payload(&bundle, anchor_signature).unwrap();

        assert!(shrunk.seed.payload.len() <= bundle.seed.payload.len());
        assert_eq!(anchor_signature(&shrunk.seed).unwrap(), bundle.signature);
    }
}
