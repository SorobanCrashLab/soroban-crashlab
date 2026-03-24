use crate::{CaseSeed, CrashSignature};

/// The three Soroban authorization modes under which a seed is exercised.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AuthMode {
    /// Authorization is strictly enforced; missing auth entries are errors.
    Enforce,
    /// Authorization requirements are recorded but not enforced.
    Record,
    /// Like [`Record`][AuthMode::Record] but permits non-root authorization entries.
    RecordAllowNonroot,
}

impl AuthMode {
    /// All three variants in a fixed, deterministic order.
    pub const ALL: [AuthMode; 3] = [
        AuthMode::Enforce,
        AuthMode::Record,
        AuthMode::RecordAllowNonroot,
    ];
}

impl std::fmt::Display for AuthMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthMode::Enforce => write!(f, "enforce"),
            AuthMode::Record => write!(f, "record"),
            AuthMode::RecordAllowNonroot => write!(f, "record_allow_nonroot"),
        }
    }
}

/// Result of running a single seed under one [`AuthMode`].
#[derive(Debug, Clone)]
pub struct ModeResult {
    /// The mode that produced this result.
    pub mode: AuthMode,
    /// The signature observed when the seed was run in `mode`.
    pub signature: CrashSignature,
}

/// Aggregated output of running a seed across all three authorization modes.
///
/// `mismatches` contains every `(mode_a, mode_b)` pair whose signatures diverged,
/// giving operators a concise cross-mode divergence summary without having to
/// compare results manually.
#[derive(Debug, Clone)]
pub struct MatrixReport {
    /// The seed that was exercised.
    pub seed: CaseSeed,
    /// One result per mode, ordered by [`AuthMode::ALL`].
    pub results: Vec<ModeResult>,
    /// Every pair of modes whose signatures differed.
    ///
    /// Empty when all modes produced identical signatures.
    pub mismatches: Vec<(AuthMode, AuthMode)>,
}

impl MatrixReport {
    /// Returns `true` when every mode produced the same signature.
    pub fn is_consistent(&self) -> bool {
        self.mismatches.is_empty()
    }
}

/// Runs `seed` through `runner` once per [`AuthMode`] and collects per-mode
/// results along with a mismatch summary.
///
/// `runner` receives the seed and the current mode and must return the
/// [`CrashSignature`] observed under that mode's authorization context. In a
/// real integration the runner invokes the contract under test with the
/// matching Soroban auth setup; in tests a closure that branches on `mode` is
/// sufficient.
///
/// # Example
///
/// ```rust
/// use crashlab_core::{CaseSeed, classify};
/// use crashlab_core::auth_matrix::{run_matrix, AuthMode};
///
/// let seed = CaseSeed { id: 1, payload: vec![1, 2, 3] };
///
/// // A runner that produces the same signature in every mode — no mismatches.
/// let report = run_matrix(&seed, |s, _mode| classify(s));
///
/// assert!(report.is_consistent());
/// assert_eq!(report.results.len(), 3);
/// ```
pub fn run_matrix<F>(seed: &CaseSeed, runner: F) -> MatrixReport
where
    F: Fn(&CaseSeed, AuthMode) -> CrashSignature,
{
    let results: Vec<ModeResult> = AuthMode::ALL
        .iter()
        .map(|&mode| ModeResult {
            mode,
            signature: runner(seed, mode),
        })
        .collect();

    let mismatches = compute_mismatches(&results);

    MatrixReport {
        seed: seed.clone(),
        results,
        mismatches,
    }
}

fn compute_mismatches(results: &[ModeResult]) -> Vec<(AuthMode, AuthMode)> {
    let mut mismatches = Vec::new();
    for i in 0..results.len() {
        for j in (i + 1)..results.len() {
            if results[i].signature != results[j].signature {
                mismatches.push((results[i].mode, results[j].mode));
            }
        }
    }
    mismatches
}

/// Filters `reports` to those that contain at least one cross-mode mismatch.
///
/// Use this after collecting a batch of [`MatrixReport`]s to isolate seeds
/// whose behavior is mode-sensitive and warrant further investigation.
pub fn collect_mismatched(reports: &[MatrixReport]) -> Vec<&MatrixReport> {
    reports.iter().filter(|r| !r.is_consistent()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CaseSeed;

    fn seed(id: u64) -> CaseSeed {
        CaseSeed {
            id,
            payload: vec![1, 2, 3],
        }
    }

    fn sig(digest: u64) -> CrashSignature {
        CrashSignature {
            category: "runtime-failure",
            digest,
            signature_hash: 0,
        }
    }

    // ── run_matrix ────────────────────────────────────────────────────────────

    #[test]
    fn consistent_runner_produces_no_mismatches() {
        let report = run_matrix(&seed(1), |_, _| sig(0xABCD));

        assert_eq!(report.results.len(), 3);
        assert!(report.mismatches.is_empty());
        assert!(report.is_consistent());
    }

    #[test]
    fn results_cover_all_three_modes() {
        let report = run_matrix(&seed(2), |_, _| sig(0x1234));

        let modes: Vec<AuthMode> = report.results.iter().map(|r| r.mode).collect();
        assert!(modes.contains(&AuthMode::Enforce));
        assert!(modes.contains(&AuthMode::Record));
        assert!(modes.contains(&AuthMode::RecordAllowNonroot));
    }

    #[test]
    fn enforce_diverging_from_others_produces_two_mismatches() {
        // Enforce↔Record and Enforce↔RecordAllowNonroot differ; Record↔RecordAllowNonroot agree.
        let report = run_matrix(&seed(3), |_, mode| {
            if mode == AuthMode::Enforce {
                sig(0xDEAD)
            } else {
                sig(0xBEEF)
            }
        });

        assert_eq!(report.mismatches.len(), 2);
        assert!(!report.is_consistent());
    }

    #[test]
    fn all_modes_diverging_produces_three_mismatches() {
        let report = run_matrix(&seed(4), |_, mode| match mode {
            AuthMode::Enforce => sig(0x01),
            AuthMode::Record => sig(0x02),
            AuthMode::RecordAllowNonroot => sig(0x03),
        });

        assert_eq!(report.mismatches.len(), 3);
        assert!(!report.is_consistent());
    }

    #[test]
    fn seed_is_preserved_in_report() {
        let s = seed(99);
        let report = run_matrix(&s, |_, _| sig(0));
        assert_eq!(report.seed, s);
    }

    #[test]
    fn per_mode_signature_is_stored_correctly() {
        let report = run_matrix(&seed(5), |_, mode| match mode {
            AuthMode::Enforce => sig(10),
            AuthMode::Record => sig(20),
            AuthMode::RecordAllowNonroot => sig(30),
        });

        for result in &report.results {
            let expected_digest = match result.mode {
                AuthMode::Enforce => 10,
                AuthMode::Record => 20,
                AuthMode::RecordAllowNonroot => 30,
            };
            assert_eq!(result.signature.digest, expected_digest);
        }
    }

    #[test]
    fn only_record_diverging_produces_two_mismatches() {
        // Record differs; Enforce and RecordAllowNonroot agree.
        let report = run_matrix(&seed(6), |_, mode| {
            if mode == AuthMode::Record {
                sig(0xFF)
            } else {
                sig(0x00)
            }
        });

        assert_eq!(report.mismatches.len(), 2);
        // Enforce and RecordAllowNonroot must NOT appear together as a mismatch.
        let has_enforce_vs_nonroot = report.mismatches.iter().any(|&(a, b)| {
            (a == AuthMode::Enforce && b == AuthMode::RecordAllowNonroot)
                || (a == AuthMode::RecordAllowNonroot && b == AuthMode::Enforce)
        });
        assert!(!has_enforce_vs_nonroot);
    }

    // ── collect_mismatched ────────────────────────────────────────────────────

    #[test]
    fn collect_mismatched_excludes_consistent_reports() {
        let consistent = run_matrix(&seed(10), |_, _| sig(0xAA));
        let divergent = run_matrix(&seed(11), |_, mode| {
            if mode == AuthMode::Enforce {
                sig(0xBB)
            } else {
                sig(0xCC)
            }
        });

        let reports = vec![consistent, divergent];
        let flagged = collect_mismatched(&reports);

        assert_eq!(flagged.len(), 1);
        assert_eq!(flagged[0].seed.id, 11);
    }

    #[test]
    fn collect_mismatched_returns_empty_when_all_consistent() {
        let r1 = run_matrix(&seed(20), |_, _| sig(0x01));
        let r2 = run_matrix(&seed(21), |_, _| sig(0x01));
        let reports = vec![r1, r2];

        assert!(collect_mismatched(&reports).is_empty());
    }

    #[test]
    fn collect_mismatched_returns_all_when_all_divergent() {
        let r1 = run_matrix(&seed(30), |_, mode| {
            if mode == AuthMode::Enforce {
                sig(1)
            } else {
                sig(2)
            }
        });
        let r2 = run_matrix(&seed(31), |_, mode| {
            if mode == AuthMode::Enforce {
                sig(3)
            } else {
                sig(4)
            }
        });
        let reports = vec![r1, r2];

        assert_eq!(collect_mismatched(&reports).len(), 2);
    }

    // ── AuthMode display ──────────────────────────────────────────────────────

    #[test]
    fn auth_mode_display_matches_spec_names() {
        assert_eq!(AuthMode::Enforce.to_string(), "enforce");
        assert_eq!(AuthMode::Record.to_string(), "record");
        assert_eq!(
            AuthMode::RecordAllowNonroot.to_string(),
            "record_allow_nonroot"
        );
    }
}
