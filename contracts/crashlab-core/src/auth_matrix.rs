use crate::retry::{execute_with_retry, RetryConfig, SimulationError};
use crate::taxonomy::{stable_failure_class_for_bundle, FailureClass};
use crate::{CaseSeed, CrashSignature};

/// The Soroban authorization modes under which a seed is exercised.
///
/// The matrix spans **seven** modes (issue #1783). Three are the original
/// enforcement levels (`Enforce`, `Record`, `RecordAllowNonroot`); four more
/// refine the enforce family by declaring which addresses the host should
/// accept as authorized signers before the invocation runs. This lets the
/// host runner translate each mode into a real [`SorobanAuthorizationEntry`]
/// frame rather than inferring auth outcomes from payload bytes.
///
/// # Mode → host auth setup
///
/// | Mode                    | Signers declared  | Host setup                                       |
/// |-------------------------|-------------------|--------------------------------------------------|
/// | `Enforce`               | none              | `mock_auths(&[])` — every `require_auth` rejects  |
/// | `EnforceAdmin`          | admin             | `mock_auths(&[admin])`                            |
/// | `EnforceOther`          | other             | `mock_auths(&[other])`                            |
/// | `EnforceAdminOther`     | admin + other     | `mock_auths(&[admin, other])`                     |
/// | `EnforceMockSigned`     | admin + other     | `mock_auths` with full verification path           |
/// | `Record`               | n/a               | `mock_all_auths()` (root enforcement)             |
/// | `RecordAllowNonroot`    | n/a               | `mock_all_auths_allowing_non_root_auth()`         |
///
/// `MissingAuth` is classified only when the host actually rejects a
/// `require_auth` call — never from payload inspection.
///
/// [`SorobanAuthorizationEntry`]: soroban_sdk::xdr::SorobanAuthorizationEntry
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AuthMode {
    /// Enforce authorization with **no declared signers** — every
    /// `require_auth` call rejects with `MissingAuth`.
    Enforce,
    /// Enforce with the scenario admin as the sole declared signer.
    EnforceAdmin,
    /// Enforce with the scenario `other` address as the sole declared signer.
    EnforceOther,
    /// Enforce with both admin and `other` declared as signers.
    EnforceAdminOther,
    /// Enforce with mock-signed entries and the **full host verification path**.
    ///
    /// Unlike the other `Enforce*` modes which register mock auths, this mode
    /// builds a complete `SorobanAuthorizationEntry` tree from the seed's
    /// declared signers so the host walks the entire auth-verification code
    /// path (nonce, signature expiry, root invocation match). Mock signatures
    /// are acceptable per the issue spec, but the host must do the work.
    EnforceMockSigned,
    /// Authorization requirements are recorded but not enforced
    /// (`env.mock_all_auths()` — root invocation enforced).
    Record,
    /// Like [`Record`][AuthMode::Record] but permits non-root authorization
    /// entries (`env.mock_all_auths_allowing_non_root_auth()`).
    RecordAllowNonroot,
}

/// Which scenario addresses a mode declares as authorized signers.
///
/// The host runner generates `admin` and `other` addresses per its documented
/// seed→scenario protocol; this enum tells the auth-frame builder which of
/// those addresses to pre-register before the invocation runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SignerSet {
    /// No declared signers — every `require_auth` rejects under enforcement.
    None,
    /// Only the scenario admin is authorized.
    Admin,
    /// Only the scenario `other` address is authorized.
    Other,
    /// Both admin and `other` are authorized.
    AdminAndOther,
}

impl AuthMode {
    /// All seven variants in a fixed, deterministic order.
    ///
    /// The order is: enforce family first (no signers → admin → other → both →
    /// mock-signed), then the record family (record → record-allow-nonroot).
    /// This keeps the original three variants in their original relative order
    /// while inserting the new enforce variants between `Enforce` and `Record`.
    pub const ALL: [AuthMode; 7] = [
        AuthMode::Enforce,
        AuthMode::EnforceAdmin,
        AuthMode::EnforceOther,
        AuthMode::EnforceAdminOther,
        AuthMode::EnforceMockSigned,
        AuthMode::Record,
        AuthMode::RecordAllowNonroot,
    ];

    /// Returns the set of declared signers for this mode.
    ///
    /// Record-family modes return [`SignerSet::None`] because they do not
    /// pre-register signers — `mock_all_auths` accepts every `require_auth`.
    pub fn signer_set(self) -> SignerSet {
        match self {
            AuthMode::Enforce => SignerSet::None,
            AuthMode::EnforceAdmin => SignerSet::Admin,
            AuthMode::EnforceOther => SignerSet::Other,
            AuthMode::EnforceAdminOther | AuthMode::EnforceMockSigned => SignerSet::AdminAndOther,
            AuthMode::Record | AuthMode::RecordAllowNonroot => SignerSet::None,
        }
    }

    /// Returns `true` when the host enforces auth entries (rejecting missing
    /// auth) as opposed to recording them.
    pub fn is_enforce(self) -> bool {
        matches!(
            self,
            AuthMode::Enforce
                | AuthMode::EnforceAdmin
                | AuthMode::EnforceOther
                | AuthMode::EnforceAdminOther
                | AuthMode::EnforceMockSigned
        )
    }

    /// Returns `true` when the host records auth entries without enforcing.
    pub fn is_record(self) -> bool {
        matches!(self, AuthMode::Record | AuthMode::RecordAllowNonroot)
    }
}

impl std::fmt::Display for AuthMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthMode::Enforce => write!(f, "enforce"),
            AuthMode::EnforceAdmin => write!(f, "enforce_admin"),
            AuthMode::EnforceOther => write!(f, "enforce_other"),
            AuthMode::EnforceAdminOther => write!(f, "enforce_admin_other"),
            AuthMode::EnforceMockSigned => write!(f, "enforce_mock_signed"),
            AuthMode::Record => write!(f, "record"),
            AuthMode::RecordAllowNonroot => write!(f, "record_allow_nonroot"),
        }
    }
}

/// The stable signature category used when the host rejects a `require_auth`
/// call because no matching authorization entry was provided.
///
/// This is only set when the **host** actually rejects the invocation — never
/// inferred from payload bytes (W5-A02).
pub const MISSING_AUTH_CATEGORY: &str = "missing-auth";

/// Diagnostic record for a single authorization frame execution.
///
/// Produced by the host runner alongside the [`CrashSignature`] when a seed is
/// executed under a specific [`AuthMode`]. Records which `require_auth` call
/// site rejected (if any) so operators can attribute a `MissingAuth` to a
/// specific authorized function rather than guessing from payload bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthFrameEntry {
    /// The mode under which the seed was executed.
    pub mode: AuthMode,
    /// The signer set declared for this execution.
    pub signers: SignerSet,
    /// `true` when the host accepted all `require_auth` calls in the invocation.
    pub authorized: bool,
    /// When `authorized` is `false`, the function that called `require_auth`
    /// and was rejected by the host, e.g. `"transfer"` or `"burn"`.
    ///
    /// `None` when the invocation did not reach a `require_auth` call (e.g.
    /// it trapped earlier for a non-auth reason).
    pub rejecting_call_site: Option<String>,
    /// When `authorized` is `false`, the address the host rejected the
    /// `require_auth` for, as a stringified Soroban address.
    pub rejecting_address: Option<String>,
}

impl AuthFrameEntry {
    /// Builds a diagnostic for a successful (fully authorized) execution.
    pub fn authorized(mode: AuthMode, signers: SignerSet) -> Self {
        Self {
            mode,
            signers,
            authorized: true,
            rejecting_call_site: None,
            rejecting_address: None,
        }
    }

    /// Builds a diagnostic for a rejected execution, recording the call site
    /// and address that the host rejected.
    pub fn rejected(
        mode: AuthMode,
        signers: SignerSet,
        call_site: impl Into<String>,
        address: impl Into<String>,
    ) -> Self {
        Self {
            mode,
            signers,
            authorized: false,
            rejecting_call_site: Some(call_site.into()),
            rejecting_address: Some(address.into()),
        }
    }

    /// Returns `true` when this entry records a host-rejected `require_auth`.
    pub fn is_missing_auth(&self) -> bool {
        !self.authorized
    }
}

impl std::fmt::Display for AuthFrameEntry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.authorized {
            write!(f, "{}({}): authorized", self.mode, self.signers)
        } else {
            write!(
                f,
                "{}({}): missing-auth at {} for {}",
                self.mode,
                self.signers,
                self.rejecting_call_site.as_deref().unwrap_or("?"),
                self.rejecting_address.as_deref().unwrap_or("?"),
            )
        }
    }
}

impl std::fmt::Display for SignerSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SignerSet::None => write!(f, "none"),
            SignerSet::Admin => write!(f, "admin"),
            SignerSet::Other => write!(f, "other"),
            SignerSet::AdminAndOther => write!(f, "admin+other"),
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

/// Aggregated output of running a seed across all seven authorization modes.
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
/// assert_eq!(report.results.len(), 7);
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

        assert_eq!(report.results.len(), AuthMode::ALL.len());
        assert!(report.mismatches.is_empty());
        assert!(report.is_consistent());
    }

    #[test]
    fn results_cover_all_seven_modes() {
        let report = run_matrix(&seed(2), |_, _| Ok(sig(0x1234))).unwrap();

        let modes: Vec<AuthMode> = report.results.iter().map(|r| r.mode).collect();
        for &mode in &AuthMode::ALL {
            assert!(modes.contains(&mode), "missing mode {mode} in results");
        }
    }

    #[test]
    fn enforce_diverging_from_others_produces_six_mismatches() {
        // Enforce differs from the other 6 modes; those 6 all agree.
        let report = run_matrix(&seed(3), |_, mode| {
            if mode == AuthMode::Enforce {
                Ok(sig(0xDEAD))
            } else {
                Ok(sig(0xBEEF))
            }
        })
        .unwrap();

        // 1 divergent mode vs 6 others = 6 mismatch pairs.
        assert_eq!(report.mismatches.len(), 6);
        assert!(!report.is_consistent());
    }

    #[test]
    fn all_modes_diverging_produces_21_mismatches() {
        // Each of the 7 modes gets a unique signature → C(7,2) = 21 pairs.
        let report = run_matrix(&seed(4), |_, mode| Ok(sig(mode as u64))).unwrap();

        assert_eq!(report.mismatches.len(), 21);
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
        let report = run_matrix(&seed(5), |_, mode| Ok(sig(mode as u64))).unwrap();

        for result in &report.results {
            assert_eq!(result.signature.digest, result.mode as u64);
        }
    }

    #[test]
    fn only_record_diverging_produces_six_mismatches() {
        // Record differs from the other 6 modes; those 6 all agree.
        let report = run_matrix(&seed(6), |_, mode| {
            if mode == AuthMode::Record {
                Ok(sig(0xFF))
            } else {
                Ok(sig(0x00))
            }
        })
        .unwrap();

        assert_eq!(report.mismatches.len(), 6);
        // No two non-Record modes should appear as a mismatch pair.
        let non_record_pair = report.mismatches.iter().any(|&(a, b)| {
            a != AuthMode::Record && b != AuthMode::Record
        });
        assert!(!non_record_pair);
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
        // Every other mode should have been called 1 time each
        for &mode in &AuthMode::ALL {
            if mode != AuthMode::Enforce {
                assert_eq!(*calls_per_mode.get(&mode).unwrap(), 1, "mode {mode}");
            }
        }
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
        assert_eq!(AuthMode::EnforceAdmin.to_string(), "enforce_admin");
        assert_eq!(AuthMode::EnforceOther.to_string(), "enforce_other");
        assert_eq!(AuthMode::EnforceAdminOther.to_string(), "enforce_admin_other");
        assert_eq!(AuthMode::EnforceMockSigned.to_string(), "enforce_mock_signed");
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
            if mode.is_enforce() && mode != AuthMode::EnforceMockSigned {
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
        // 4 strict-enforce variants diverge from the other 3.
        assert_eq!(report.mismatches.len(), 4 * 3);
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
        // Give each mode a distinct category so every pair is a mismatch.
        let report = run_matrix(&s, |_, mode| Ok(CrashSignature {
            category: mode.to_string(),
            digest: mode as u64,
            signature_hash: mode as u64,
        })).unwrap();

        let summary = format_mismatch_summary(&report);
        assert!(summary.contains("seed 5:"));
        // Enforce should mismatch against Record (and others).
        assert!(summary.contains("enforce["));
        assert!(summary.contains(" \u{2260} "));
    }

    // ── cross-module integration ──────────────────────────────────────────────

    #[test]
    fn integration_fuzzer_bundle_replay() {
        use crate::bundle_persist::{save_case_bundle_json, load_case_bundle_json};
        use crate::replay::replay_seed_bundle;
        use crate::CaseBundle;
        use crate::classify;

        let s = seed(6);
        let reports = run_matrix_for_seeds(&[s.clone()], |s, _| {
            // Use the actual classify() function to get realistic signature values
            Ok(classify(s))
        });
        
        let report = reports.into_iter().next().unwrap().unwrap();
        assert!(report.is_consistent());
        
        let bundle = CaseBundle {
            seed: report.seed.clone(),
            signature: report.results[0].signature.clone(),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
        };

        let bytes = save_case_bundle_json(&bundle).unwrap();
        let loaded_bundle = load_case_bundle_json(&bytes).unwrap();
        
        let replay_result = replay_seed_bundle(&loaded_bundle);
        assert!(replay_result.matches, 
            "Replay mismatch: expected={:?}, actual={:?}", 
            replay_result.expected, replay_result.actual);
        assert_eq!(replay_result.expected_class, FailureClass::Xdr); // Payload [1, 2, 3] begins with 1 -> Xdr
    }

    // ── HostContractRunner integration ────────────────────────────────────────

    #[test]
    #[cfg(feature = "host-runner")]
    fn host_runner_works_with_matrix() {
        use crate::HostContractRunner;
        use crate::runner::ContractRunner;

        // Create a host runner with mock authorizations enabled
        let mut host_runner = HostContractRunner::new();
        let seed = seed(7);

        // Adapt the host runner to work with the auth_matrix interface.
        // The host runner doesn't natively support AuthMode switching, so for
        // this test we run it once and verify the result works with the matrix.
        let first_result = host_runner.run_seed(&seed).unwrap();

        // Run the seed through the matrix using a mock runner that always
        // returns the same signature (simulating consistent behavior across modes).
        let report = run_matrix(&seed, |_, _| Ok(first_result.clone())).unwrap();

        // Verify the matrix detected no mismatches when all modes produce the same signature
        assert!(report.is_consistent());
        assert_eq!(report.results.len(), AuthMode::ALL.len());
        
        // Verify each mode got the expected result
        for result in &report.results {
            assert_eq!(result.signature, first_result);
        }
    }

    #[test]
    #[cfg(feature = "host-runner")]
    fn host_runner_executes_multiple_seeds_with_matrix() {
        use crate::HostContractRunner;
        use crate::runner::ContractRunner;

        let seeds = vec![seed(100), seed(101), seed(102)];
        let mut host_runner = HostContractRunner::new();

        // Execute each seed through the host runner and verify they all work with matrix
        for test_seed in seeds {
            let sig = host_runner.run_seed(&test_seed).unwrap();
            
            // Verify this signature works through the matrix
            let report = run_matrix(&test_seed, |_, _| Ok(sig.clone())).unwrap();
            assert!(report.is_consistent(), 
                "Seed {} should produce consistent signature across modes", test_seed.id);
            assert_eq!(report.seed.id, test_seed.id);
        }
    }

    #[test]
    #[cfg(feature = "host-runner")]
    fn determinism_test_host_runner_produces_consistent_signatures() {
        use crate::HostContractRunner;
        use crate::runner::ContractRunner;

        let seed = seed(200);
        let mut runner1 = HostContractRunner::new();
        let mut runner2 = HostContractRunner::new();

        // Execute the same seed with two separate runner instances
        let sig1 = runner1.run_seed(&seed).unwrap();
        let sig2 = runner2.run_seed(&seed).unwrap();

        // Both should produce identical signatures
        assert_eq!(sig1.category, sig2.category);
        assert_eq!(sig1.digest, sig2.digest);
        assert_eq!(sig1.signature_hash, sig2.signature_hash);

        // Verify they work correctly through the matrix
        let sig1_clone = sig1.clone();
        let report1 = run_matrix(&seed, |_, _| Ok(sig1_clone.clone())).unwrap();
        
        let sig2_clone = sig2.clone();
        let report2 = run_matrix(&seed, |_, _| Ok(sig2_clone.clone())).unwrap();
        
        assert_eq!(report1.mismatches, report2.mismatches);
    }

    #[test]
    #[cfg(feature = "host-runner")]
    fn host_runner_with_mock_auths_disabled() {
        use crate::HostContractRunner;
        use crate::runner::ContractRunner;

        // Create a runner with mock authorizations disabled
        let mut runner_no_mock = HostContractRunner::with_mock_auths(false);
        let seed = seed(201);

        // Execute the seed and verify it produces a valid signature
        let sig = runner_no_mock.run_seed(&seed).unwrap();
        
        // Verify the signature can be used with matrix without errors
        let sig_clone = sig.clone();
        let report = run_matrix(&seed, |_, _| Ok(sig_clone.clone())).unwrap();
        assert!(report.is_consistent());
    }

    // ── AuthMode helpers and AuthFrameEntry (issue #1783) ─────────────────────

    #[test]
    fn auth_mode_all_has_seven_variants() {
        assert_eq!(AuthMode::ALL.len(), 7);
    }

    #[test]
    fn auth_mode_is_enforce_and_is_record_partition_correctly() {
        for &mode in &AuthMode::ALL {
            assert!(mode.is_enforce() ^ mode.is_record());
        }
    }

    #[test]
    fn auth_mode_signer_set_matches_spec() {
        assert_eq!(AuthMode::Enforce.signer_set(), SignerSet::None);
        assert_eq!(AuthMode::EnforceAdmin.signer_set(), SignerSet::Admin);
        assert_eq!(AuthMode::EnforceOther.signer_set(), SignerSet::Other);
        assert_eq!(AuthMode::EnforceAdminOther.signer_set(), SignerSet::AdminAndOther);
        assert_eq!(AuthMode::EnforceMockSigned.signer_set(), SignerSet::AdminAndOther);
        assert_eq!(AuthMode::Record.signer_set(), SignerSet::None);
        assert_eq!(AuthMode::RecordAllowNonroot.signer_set(), SignerSet::None);
    }

    #[test]
    fn auth_frame_entry_authorized_display() {
        let entry = AuthFrameEntry::authorized(AuthMode::EnforceAdmin, SignerSet::Admin);
        assert!(entry.authorized);
        assert!(!entry.is_missing_auth());
        assert!(entry.to_string().contains("authorized"));
    }

    #[test]
    fn auth_frame_entry_rejected_records_call_site() {
        let entry = AuthFrameEntry::rejected(
            AuthMode::Enforce,
            SignerSet::None,
            "burn",
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
        assert!(!entry.authorized);
        assert!(entry.is_missing_auth());
        assert_eq!(entry.rejecting_call_site.as_deref(), Some("burn"));
        assert!(entry.to_string().contains("missing-auth"));
        assert!(entry.to_string().contains("burn"));
    }

    #[test]
    fn signer_set_display() {
        assert_eq!(SignerSet::None.to_string(), "none");
        assert_eq!(SignerSet::Admin.to_string(), "admin");
        assert_eq!(SignerSet::Other.to_string(), "other");
        assert_eq!(SignerSet::AdminAndOther.to_string(), "admin+other");
    }

    #[test]
    fn missing_auth_category_constant_is_stable() {
        assert_eq!(MISSING_AUTH_CATEGORY, "missing-auth");
    }
}

