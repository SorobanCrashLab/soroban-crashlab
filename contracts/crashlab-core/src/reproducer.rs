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
/// let report = detector.check(&bundle, |_seed| bundle.signature.clone());
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
    pub fn check<F>(&self, bundle: &CaseBundle, reproducer: F) -> ReproReport
    where
        F: Fn(&CaseSeed) -> CrashSignature,
    {
        let stable_count = (0..self.runs)
            .filter(|_| reproducer(&bundle.seed) == bundle.signature)
            .count() as u32;

        let flake_rate = (self.runs - stable_count) as f64 / self.runs as f64;

        ReproReport {
            bundle: bundle.clone(),
            runs: self.runs,
            stable_count,
            flake_rate,
            is_stable: flake_rate <= self.threshold,
        }
    }
}

/// Filters `bundles` down to those that are stable enough for a CI regression pack.
///
/// Each bundle is evaluated with `detector`.  Any bundle whose flake rate exceeds
/// `detector.threshold` is excluded from the returned collection.
///
/// # Arguments
///
/// * `bundles`    – Candidate fixtures to evaluate.
/// * `detector`   – Configured [`FlakyDetector`] that drives each stability check.
/// * `reproducer` – Function that re-executes a seed and returns its signature.
pub fn filter_ci_pack<'a, F>(
    bundles: &'a [CaseBundle],
    detector: &FlakyDetector,
    reproducer: F,
) -> Vec<&'a CaseBundle>
where
    F: Fn(&CaseSeed) -> CrashSignature,
{
    bundles
        .iter()
        .filter(|b| detector.check(b, &reproducer).is_stable)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CaseSeed, CrashSignature, to_bundle};
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

        let report = detector.check(&bundle, |_| bundle.signature.clone());

        assert_eq!(report.runs, 10);
        assert_eq!(report.stable_count, 10);
        assert_eq!(report.flake_rate, 0.0);
        assert!(report.is_stable);
    }

    #[test]
    fn always_diverging_reproducer_has_full_flake_rate() {
        let bundle = make_bundle(2, vec![5, 6, 7]);
        let detector = FlakyDetector::new(8, 0.5);

        let report = detector.check(&bundle, |_| divergent_sig());

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

        let report = detector.check(&bundle, |_| {
            let n = counter.get();
            counter.set(n + 1);
            // Even calls reproduce correctly; odd calls diverge → 2/4 stable.
            if n % 2 == 0 {
                bundle.signature.clone()
            } else {
                divergent_sig()
            }
        });

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

        let report = detector.check(&bundle, |_| {
            let n = counter.get();
            counter.set(n + 1);
            if n < 7 {
                bundle.signature.clone()
            } else {
                divergent_sig()
            }
        });

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

        let report = detector.check(&bundle, |_| {
            let n = counter.get();
            counter.set(n + 1);
            if n < 6 {
                bundle.signature.clone()
            } else {
                divergent_sig()
            }
        });

        assert_eq!(report.stable_count, 6);
        assert!(!report.is_stable);
    }

    // ── filter_ci_pack ────────────────────────────────────────────────────────

    #[test]
    fn filter_ci_pack_excludes_flaky_bundle() {
        let stable = make_bundle(10, vec![1, 2]);
        let flaky = make_bundle(11, vec![3, 4]);

        let stable_sig = stable.signature.clone();
        let stable_id = stable.seed.id;
        let flaky_id = flaky.seed.id;

        let bundles = vec![stable, flaky];
        let detector = FlakyDetector::new(5, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, move |seed| {
            if seed.id == stable_id {
                stable_sig.clone()
            } else {
                divergent_sig()
            }
        });

        assert_eq!(pack.len(), 1);
        assert_eq!(pack[0].seed.id, stable_id);
        assert!(pack.iter().all(|b| b.seed.id != flaky_id));
    }

    #[test]
    fn filter_ci_pack_retains_all_stable_bundles() {
        let b1 = make_bundle(20, vec![1]);
        let b2 = make_bundle(21, vec![2]);

        let sig1 = b1.signature.clone();
        let sig2 = b2.signature.clone();
        let id1 = b1.seed.id;
        let id2 = b2.seed.id;

        let bundles = vec![b1, b2];
        let detector = FlakyDetector::new(3, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, move |seed| {
            if seed.id == id1 {
                sig1.clone()
            } else {
                sig2.clone()
            }
        });

        assert_eq!(pack.len(), 2);
        let ids: Vec<u64> = pack.iter().map(|b| b.seed.id).collect();
        assert!(ids.contains(&id1));
        assert!(ids.contains(&id2));
    }

    #[test]
    fn filter_ci_pack_returns_empty_when_all_bundles_are_flaky() {
        let b1 = make_bundle(30, vec![0xFF]);
        let b2 = make_bundle(31, vec![0xFE]);
        let bundles = vec![b1, b2];
        let detector = FlakyDetector::new(4, 0.0);

        let pack = filter_ci_pack(&bundles, &detector, |_| divergent_sig());

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
}
