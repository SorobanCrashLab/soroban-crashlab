use crate::retry::{execute_with_retry, RetryConfig, SimulationError};
use crate::taxonomy::{stable_failure_class_for_bundle, FailureClass};
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

    /// Returns the FailureClass for a given mode's result, using
    /// stable_failure_class_for_bundle for legacy-safe classification.
    pub fn failure_class_for_mode(&self, mode: AuthMode) -> Option<FailureClass> {
        self.results.iter().find(|r| r.mode == mode).map(|r| {
            stable_failure_class_for_bundle(&self.seed, &r.signature)
        })
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
/// If the runner returns a transient error (e.g., RPC timeout), it is retried
/// according to the default [`RetryConfig`].
///
/// # Errors
///
/// Returns [`SimulationError`] if a mode fails after all retry attempts or
/// if a non-transient error is encountered.
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
/// let report = run_matrix(&seed, |s, _mode| Ok(classify(s))).unwrap();
///
/// assert!(report.is_consistent());
/// assert_eq!(report.results.len(), 3);
/// ```
pub fn run_matrix<F>(seed: &CaseSeed, mut runner: F) -> Result<MatrixReport, SimulationError>
where
    F: FnMut(&CaseSeed, AuthMode) -> Result<CrashSignature, SimulationError>,
{
    let config = RetryConfig::default();
    let mut results = Vec::with_capacity(AuthMode::ALL.len());

    for &mode in &AuthMode::ALL {
        let signature = execute_with_retry(&config, None, || runner(seed, mode))?;
        results.push(ModeResult { mode, signature });
    }

    let mismatches = compute_mismatches(&results);

    Ok(MatrixReport {
        seed: seed.clone(),
        results,
        mismatches,
    })
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

/// Runs a batch of seeds through the matrix and returns one MatrixReport per seed.
pub fn run_matrix_for_seeds<F>(
    seeds: &[CaseSeed],
    mut runner: F,
) -> Vec<Result<MatrixReport, SimulationError>>
where
    F: FnMut(&CaseSeed, AuthMode) -> Result<CrashSignature, SimulationError>,
{
    seeds.iter().map(|seed| run_matrix(seed, &mut runner)).collect()
}

/// A human-readable mismatch summary for a MatrixReport, including FailureClass
/// per mode for triage.
pub fn format_mismatch_summary(report: &MatrixReport) -> String {
    let mut parts = Vec::new();
    for &(mode_a, mode_b) in &report.mismatches {
        let class_a = report
            .failure_class_for_mode(mode_a)
            .map_or("?".to_string(), |c| c.as_str().to_string());
        let class_b = report
            .failure_class_for_mode(mode_b)
            .map_or("?".to_string(), |c| c.as_str().to_string());
        parts.push(format!(
            "{}[{}] \u{2260} {}[{}]",
            mode_a, class_a, mode_b, class_b
        ));
    }
    format!("seed {}: {}", report.seed.id, parts.join(", "))
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
            category: "runtime-failure".to_string(),
            digest,
            signature_hash: digest.wrapping_mul(31),
        }
    }

    // ── run_matrix ────────────────────────────────────────────────────────────

    #[test]
    fn consistent_runner_produces_no_mismatches() {
        let report = run_matrix(&seed(1), |_, _| Ok(sig(0xABCD))).unwrap();

        assert_eq!(report.results.len(), 3);
        assert!(report.mismatches.is_empty());
        assert!(report.is_consistent());
    }

    #[test]
    fn results_cover_all_three_modes() {
        let report = run_matrix(&seed(2), |_, _| Ok(sig(0x1234))).unwrap();

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
                Ok(sig(0xDEAD))
            } else {
                Ok(sig(0xBEEF))
            }
        })
        .unwrap();

        assert_eq!(report.mismatches.len(), 2);
        assert!(!report.is_consistent());
    }

    #[test]
    fn all_modes_diverging_produces_three_mismatches() {
        let report = run_matrix(&seed(4), |_, mode| match mode {
            AuthMode::Enforce => Ok(sig(0x01)),
            AuthMode::Record => Ok(sig(0x02)),
            AuthMode::RecordAllowNonroot => Ok(sig(0x03)),
        })
        .unwrap();

        assert_eq!(report.mismatches.len(), 3);
        assert!(!report.is_consistent());
    }

    #[test]
    fn seed_is_preserved_in_report() {
        let s = seed(99);
        let report = run_matrix(&s, |_, _| Ok(sig(0))).unwrap();
        assert_eq!(report.seed, s);
    }

    #[test]
    fn per_mode_signature_is_stored_correctly() {
        let report = run_matrix(&seed(5), |_, mode| match mode {
            AuthMode::Enforce => Ok(sig(10)),
            AuthMode::Record => Ok(sig(20)),
            AuthMode::RecordAllowNonroot => Ok(sig(30)),
        })
        .unwrap();

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
                Ok(sig(0xFF))
            } else {
                Ok(sig(0x00))
            }
        })
        .unwrap();

        assert_eq!(report.mismatches.len(), 2);
        // Enforce and RecordAllowNonroot must NOT appear together as a mismatch.
        let has_enforce_vs_nonroot = report.mismatches.iter().any(|&(a, b)| {
            (a == AuthMode::Enforce && b == AuthMode::RecordAllowNonroot)
                || (a == AuthMode::RecordAllowNonroot && b == AuthMode::Enforce)
        });
        assert!(!has_enforce_vs_nonroot);
    }

    #[test]
    fn run_matrix_retries_on_transient_error() {
        let mut calls_per_mode = std::collections::HashMap::new();

        let report = run_matrix(&seed(7), |_, mode| {
            let count = calls_per_mode.entry(mode).or_insert(0);
            *count += 1;
            if mode == AuthMode::Enforce && *count < 3 {
                Err(SimulationError::Transient("rpc timeout".to_string()))
            } else {
                Ok(sig(0))
            }
        })
        .unwrap();

        assert!(report.is_consistent());
        // Enforce should have been called 3 times (2 fails + 1 success)
        assert_eq!(*calls_per_mode.get(&AuthMode::Enforce).unwrap(), 3);
        // Others should have been called 1 time each
        assert_eq!(*calls_per_mode.get(&AuthMode::Record).unwrap(), 1);
        assert_eq!(
            *calls_per_mode.get(&AuthMode::RecordAllowNonroot).unwrap(),
            1
        );
    }

    // ── collect_mismatched ────────────────────────────────────────────────────

    #[test]
    fn collect_mismatched_excludes_consistent_reports() {
        let consistent = run_matrix(&seed(10), |_, _| Ok(sig(0xAA))).unwrap();
        let divergent = run_matrix(&seed(11), |_, mode| {
            if mode == AuthMode::Enforce {
                Ok(sig(0xBB))
            } else {
                Ok(sig(0xCC))
            }
        })
        .unwrap();

        let reports = vec![consistent, divergent];
        let flagged = collect_mismatched(&reports);

        assert_eq!(flagged.len(), 1);
        assert_eq!(flagged[0].seed.id, 11);
    }

    #[test]
    fn collect_mismatched_returns_empty_when_all_consistent() {
        let r1 = run_matrix(&seed(20), |_, _| Ok(sig(0x01))).unwrap();
        let r2 = run_matrix(&seed(21), |_, _| Ok(sig(0x01))).unwrap();
        let reports = vec![r1, r2];

        assert!(collect_mismatched(&reports).is_empty());
    }

    #[test]
    fn collect_mismatched_returns_all_when_all_divergent() {
        let r1 = run_matrix(&seed(30), |_, mode| {
            if mode == AuthMode::Enforce {
                Ok(sig(1))
            } else {
                Ok(sig(2))
            }
        })
        .unwrap();
        let r2 = run_matrix(&seed(31), |_, mode| {
            if mode == AuthMode::Enforce {
                Ok(sig(3))
            } else {
                Ok(sig(4))
            }
        })
        .unwrap();
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

    // ── run_matrix_for_seeds ──────────────────────────────────────────────────

    #[test]
    fn run_matrix_for_seeds_handles_empty_slice() {
        let reports = run_matrix_for_seeds(&[], |_, _| Ok(sig(0)));
        assert!(reports.is_empty());
    }

    #[test]
    fn run_matrix_for_seeds_propagates_nontransient_error() {
        let seeds = vec![seed(1), seed(2)];
        let mut call_count = 0;
        let reports = run_matrix_for_seeds(&seeds, |_, _| {
            call_count += 1;
            if call_count == 1 {
                Err(SimulationError::NonTransient("fail".to_string()))
            } else {
                Ok(sig(0))
            }
        });

        assert_eq!(reports.len(), 2);
        assert!(reports[0].is_err());
        assert!(reports[1].is_ok());
    }

    // ── boundary and malformed inputs ─────────────────────────────────────────

    #[test]
    fn empty_seed_runs_through_all_modes() {
        let empty = CaseSeed { id: 1, payload: vec![] };
        let report = run_matrix(&empty, |s, _| {
            Ok(CrashSignature {
                category: crate::taxonomy::classify_failure(s).as_str().to_string(),
                digest: 0,
                signature_hash: 0,
            })
        }).unwrap();
        assert!(report.is_consistent());
        assert_eq!(report.failure_class_for_mode(AuthMode::Enforce), Some(FailureClass::EmptyInput));
    }

    #[test]
    fn oversized_seed_runs_through_all_modes() {
        let oversized = CaseSeed { id: 2, payload: vec![0xA0; 65] };
        let report = run_matrix(&oversized, |s, _| {
            Ok(CrashSignature {
                category: crate::taxonomy::classify_failure(s).as_str().to_string(),
                digest: 0,
                signature_hash: 0,
            })
        }).unwrap();
        assert!(report.is_consistent());
        assert_eq!(report.failure_class_for_mode(AuthMode::Record), Some(FailureClass::OversizedInput));
    }

    #[test]
    fn invalid_enum_tag_seed_consistent_across_modes() {
        let invalid = CaseSeed { id: 3, payload: vec![0xE0, 0xFF] };
        let report = run_matrix(&invalid, |s, _| {
            Ok(CrashSignature {
                category: crate::taxonomy::classify_failure(s).as_str().to_string(),
                digest: 0,
                signature_hash: 0,
            })
        }).unwrap();
        assert!(report.is_consistent());
        assert_eq!(report.failure_class_for_mode(AuthMode::Enforce), Some(FailureClass::InvalidEnumTag));
    }

    #[test]
    fn non_root_context_seed_diverges_on_enforce() {
        let s = seed(4); // Payload: [1, 2, 3] maps to Xdr
        let report = run_matrix(&s, |_, mode| {
            if mode == AuthMode::Enforce {
                Ok(CrashSignature {
                    category: "auth".to_string(),
                    digest: 1,
                    signature_hash: 1,
                })
            } else {
                Ok(CrashSignature {
                    category: "xdr".to_string(),
                    digest: 2,
                    signature_hash: 2,
                })
            }
        }).unwrap();
        assert!(!report.is_consistent());
        assert_eq!(report.mismatches.len(), 2);
    }

    // ── determinism and mismatch formatting ───────────────────────────────────

    #[test]
    fn determinism_test_same_seed_and_runner_yield_identical_reports() {
        let s = seed(100);
        let mut runner = |s: &CaseSeed, mode: AuthMode| -> Result<CrashSignature, SimulationError> {
            let digest = s.payload.len() as u64 + (mode as u64);
            Ok(sig(digest))
        };
        let report1 = run_matrix(&s, &mut runner).unwrap();
        let report2 = run_matrix(&s, &mut runner).unwrap();
        
        assert_eq!(report1.mismatches, report2.mismatches);
        for (r1, r2) in report1.results.iter().zip(report2.results.iter()) {
            assert_eq!(r1.mode, r2.mode);
            assert_eq!(r1.signature, r2.signature);
        }
    }

    #[test]
    fn mismatch_summary_formats_correctly() {
        let s = seed(5); // Payload: [1, 2, 3] -> Xdr
        let report = run_matrix(&s, |_, mode| {
            match mode {
                AuthMode::Enforce => Ok(CrashSignature {
                    category: "auth".to_string(),
                    digest: 1,
                    signature_hash: 1,
                }),
                AuthMode::Record => Ok(CrashSignature {
                    category: "budget".to_string(),
                    digest: 2,
                    signature_hash: 2,
                }),
                AuthMode::RecordAllowNonroot => Ok(CrashSignature {
                    category: "xdr".to_string(),
                    digest: 3,
                    signature_hash: 3,
                }),
            }
        }).unwrap();

        let summary = format_mismatch_summary(&report);
        assert!(summary.contains("seed 5:"));
        assert!(summary.contains("enforce[auth] \u{2260} record[budget]"));
        assert!(summary.contains("enforce[auth] \u{2260} record_allow_nonroot[xdr]"));
        assert!(summary.contains("record[budget] \u{2260} record_allow_nonroot[xdr]"));
    }

    // ── cross-module integration ──────────────────────────────────────────────

    #[test]
    fn integration_fuzzer_bundle_replay() {
        use crate::bundle_persist::{CASE_BUNDLE_SCHEMA_VERSION, save_case_bundle_json, load_case_bundle_json};
        use crate::replay::replay_seed_bundle;
        use crate::CaseBundle;

        let s = seed(6);
        let reports = run_matrix_for_seeds(&[s.clone()], |s, _| {
            Ok(CrashSignature {
                category: crate::taxonomy::classify_failure(s).as_str().to_string(),
                digest: 99,
                signature_hash: 99,
            })
        });
        
        let report = reports.into_iter().next().unwrap().unwrap();
        assert!(report.is_consistent());
        
        let bundle = CaseBundle {
            seed: report.seed,
            signature: report.results[0].signature.clone(),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let bytes = save_case_bundle_json(&bundle).unwrap();
        let loaded_bundle = load_case_bundle_json(&bytes).unwrap();
        
        let replay_result = replay_seed_bundle(&loaded_bundle);
        assert!(replay_result.matches);
        assert_eq!(replay_result.expected_class, FailureClass::Xdr); // Payload [1, 2, 3] begins with 1 -> Xdr
    }
}
