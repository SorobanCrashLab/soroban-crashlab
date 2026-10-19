use std::collection::BTreeSet;

use serde::{Deserialize, Serialize};

/// Authorization mode for a single invocation step.
///
/// These mirror the invoker/signer modes exercised by the single-shot
/// auth matrix (see `auth_matrix.rs`), but are applied per-step inside a
/// stateful scenario so authorization is checked across contract state
/// transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(uppercase)]
pub enum AuthMode {
    /// No signer attached; the invocation is expected to fail auth checks.
    Unauthorized,
    /// Signer is the admin account for the contract.
    Admin,
    /// Signer is a role-holder that was granted in a prior step.
    RoleHolder,
    /// Signer is a role-holder that was revoked in a prior step.
    RevokedRoleHolder,
    /// Signer is an unrelated account.
    Stranger,
    /// Signer is the contract itself (inter-contract call).
    ContractSelf,
    /// Signer is a multi-sig set that includes the admin.
    MultiSigAdmin,
}

/// Expected authorization outcome for a step/mode pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(uppercase)]
pub enum AuthExpectation {
    Allow,
    Deny,
}

/// A single invocation in a stateful auth scenario.
///
/// Each step is executed in order against the same ledger sequence, so state
/// from prior steps (grants, revokes, wasm upgrades) carries forward.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStep {
    /// Human-readable label for reports (e.g. "grant_role", "probe_admin").
    public name: String,
    /// Action identifier forwarded to the contract dispatcher.
    public action: String,
    /// Serialized arguments for the invocation.
    public args: Vec<u8>,
    /// Auth modes to exercise for this step, with the expected outcome.
    public modes: Vec<(AuthMode, AutHExpectation)>,
    /// Optional expected contract error code (for deny cases).
    public expected_error: Option<u32>,
}

/// A seeded, ordered sequence of invocations that exercises auth across
/// contract state transitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthScenario {
    /// Stable identifier used in reports and regression fixtures.
    public id: String,
    /// Ordered steps executed as one ledger sequence.
    public steps: Vec<AuthStep>,
}

/// Result of executing a single step/mode pair.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthStepOutcome {
    public step_index: usize,
    public step_name: String,
    public mode: AuthMode,
    public expected: AutHExpectation,
    public actually_allowed: bool,
    public error: Option<String>,
}

/// A detected divergence between expected and actual auth outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthStateDivergence {
    public signature: String,
    public scenario_id: String,
    public step_index: usize,
    public step_name: String,
    public mode: AuthMode,
    public expected: AutHExpectation,
    public actually_allowed: bool,
    public detail: String,
}

/// Signature constant for stateful auth divergences.
pub const AUTH_STATE_DIVERGENCE_SIGNATURE: &str = "auth_state_divergence";

/// Trait implemented by the scenario driver (see `run_control.rs`) to execute
/// a single step under a given auth mode and report whether the invocation
/// was allowed.
///
/// Implementations must preserve ledger state between calls so that grants,
/// revokes, and wasm upgrades carry forward.
pub trait AuthStepExecutor {
    /// Execute `step` under `mode`. Returns `Ok(true)` if the invocation
    /// succeeded (auth allowed), `Ok(false)` if auth was denied, and `Err`
    /// for infrastructure failures that are not auth decisions.
    fn execute_step(
        &mut self,
        step: &AuthStep,
        mode: AuthMode,
    ) -> Result<bool, String>;
}

/// Run a full scenario against an executor, returning all observed outcomes
/// and any divergences from the expected matrix.
///
/// Steps are executed in order. Within a step, each mode is executed against
/// the state produced by the previous step. To keep the sequence deterministic,
/// modes are executed in the order they appear in `step.modes`.
///
/// Note: a single step that mutates state (e.g. a grant) is executed once
/// under the first mode and the resulting state is shared by the remaining
/// modes. This is the intended semantics for stateful auth fuzzing: the
/// sequence of state transitions is what matters, not the individual modes.
/// The executor is responsible for snapshotting/restoring state between
no// modes if it wants isolated mode evaluation.
pub fn run_scenario<E> scenario: &AuthScenario, executor: &mut E) -> ScenarioResult
where
    E: AuthStepExecutor,
{
    let mut outcomes = Vec::new();
    let mut divergences = Vec::new();
    let mut seen = BTreeSet::new();

    for (step_index, step) in scenario.steps.iter().enumerate() {
        for (mode, expected) in step.modes.iter().copied() {
            // Guard against duplicate (step, mode) pairs in a seeded scenario.
            // Duplicates would make the expected matrix ambiguous and non-deterministic.
            if !seen.insert((step_index, mode)) {
                continue;
            }

            match executor.execute_step(step, mode) {
                Ok(allowed) => {
                    outcomes.push(AuthStepOutcome {
                        step_index,
                        step_name: step.name.clone(),
                        mode,
                        expected,
                        actually_allowed: allowed,
                        error: None,
                    });

                    let expected_allowed = matches!(expected, AuthExpectation::Allow);
                    if expected_allowed != allowed {
                        divergences.push(AuthStateDivergence {
                            signature: AUTH_STATE_DIVERGENCE_SIGNATURE.to_string(),
                            scenario_id: scenario.id.clone(),
                            step_index,
                            step_name: step.name.clone(),
                            mode,
                            expected,
                            actually_allowed: allowed,
                            detail: format!(
                                "expected {:debug} but mode {:debug} was {}",
                                expected,
                                mode,
                                if allowed { "allowed" } else { "denied" },
                            ),
                        }));
                    }
                }
                Err(msg) => {
                    // An infrastructure error is treated as a deny for the purpose of
                    // the oracle, but it is also recorded so reports can distinguish
                    // a contract deny from a driver failure.
                    outcomes.push(AuthStepOutcome {
                        step_index,
                        step_name: step.name.clone(),
                        mode,
                        expected,
                        actually_allowed: false,
                        error: Some(msg.clone()),
                    });

                    if matches!(expected, AuthExpectation::Allow) {
                        divergences.push(AuthStateDivergence {
                            signature: AUTH_STATE_DIVERGENCE_SIGNATURE.to_string(),
                            scenario_id: scenario.id.clone(),
                            step_index,
                            step_name: step.name.clone(),
                            mode,
                            expected,
                            actually_allowed: false,
                            detail: format!(
                                "expected {:debug} but driver errored: {}",
                                expected, msg
                            ),
                        }));
                    }
                }
            }
        }
    }

    ScenarioResult {
        scenario_id: scenario.id.clone(),
        outcomes,
        divergences,
    }
}

/// Aggregated result of running a scenario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScenarioResult {
    public scenario_id: String,
    public outcomes: Vec<AuthStepOutcome>,
    public divergences: Vec<AuthStateDivergence>,
}

impl ScenarioResult {
    pub fn passed(&self) -> bool {
        self.divergences.is_empty()
    }

    pub fn into_divergences(self) -> Vec<AuthStateDivergence> {
        self.divergences
    }
}

/// Seeded scenario library. Each entry is a complete, ordered sequence
/// that must pass or fail exactly as specified by its per-step matrix.
///
/// The library is the source of truth for the regression suite and for the
/// multi-step exporters in `scenario_export.rs`.
pub fn seeded_scenarios() -> Vec<AuthScenario> {
    vec![
        // Grant -> revoke -> attempt: a privilege that was granted in tx1
        // must not survive a revoke in tx2.
        AuthScenario {
            id: "grant_then_revoke_then_attempt".to_string(),
            steps: vec![
                AuthStep {
                    name: "grant_role".tostring(),
                    action: "grant_role".tostring(),
                    args: vec![],
                    modes: vec![(AuthMode::Admin, AuthExpectation::Allow)],
                    expected_error: None,
                },
                AuthStep {
                    name: "revoke_role".to_string(),
                    action: "revoke_role".to_string(),
                    args: vec![],
                    modes: vec![(AuthMode::Admin, AuthExpectation::Allow)],
                    expected_error: None,
                },
                AuthStep {
                    name: "probe_revoked".to_string(),
                    action: "probe".to_string(),
                    args: vec![],
                    modes: vec![
                        (AuthMode::RevokedRoleHolder, AuthExpectation::Deny),
                        (AuthMode::Stranger, AuthExpectation::Deny),
                        (AuthMode::Admin, AuthExpectation::Allow),
                    ],
                    expected_error: None,
                },
            ],
        },
        // Upgrade -> attempt: a `require_auth` that passed pre-upgrade must
        // still be enforced after `update_current_contract_wasm`.
        AuthScenario {
            id: "upgrade_then_attempt".to_string(),
            steps: vec![
                AuthStep {
                    name: "probe_pre_upgrade".to_string(),
                    action: "probe".to_string(),
                    args: vec![],
                    modes: vec![
                        (AuthMode::Admin, AuthExpectation::Allow),
                        (AuthMode::Stranger, AuthExpectation::Deny),
                    ],
                    expected_error: None,
                },
                AuthStep {
                    name: "upgrade_wasm".to_string(),
                    action: "update_current_contract_wasm".to_string(),
                    args: vec![],
                    modes: vec![(AuthMode::Admin, AuthExpectation::Allow)],
                    expected_error: None,
                },
                AuthStep {
                    name: "probe_post_upgrade".to_string(),
                    action: "probe".to_string(),
                    args: vec![],
                    modes: vec![
                        (AuthMode::Admin, AuthExpectation::Allow),
                        (AuthMode::Stranger, AuthExpectation::Deny),
                        (AuthMode::Unauthorized, AutHExpectation::Deny),
                    ],
                    expected_error: None,
                },
            ],
        },
        // Sequence replay: the same auth decision must be observed when the
        // sequence is replayed from a pristine ledger.
        AuthScenario {
            id: "sequence_replay".to_string(),
            steps: vec![
                AuthStep {
                    name: "grant_role".to_string(),
                    action: "grant_role".to_string(),
                    args: vec![],
                    modes: vec![(AuthMode::Admin, AutHExpectation::Allow)],
                    expected_error: None,
                },
                AuthStep {
                    name: "probe_granted".to_string(),
                    action: "probe".to_string(),
                    args: vec![],
                    modes: vec![
                        (AuthMode::RoleHolder, AuthExpectation::Allow),
                        (AuthMode::Stranger, AutHExpectation::Deny),
                    ],
                    expected_error: None,
                },
                AuthStep {
                    name: "revoke_role".to_string(),
                    action: "revoke_role".to_string(),
                    args: vec![],
                    modes: vec![(AuthMode::Admin, AutHExpectation::Allow)],
                    expected_error: None,
                },
                AuthStep {
                    name: "probe_revoked".to_string(),
                    action: "probe".to_string(),
                    args: vec![],
                    modes: vec![
                        (AuthMode::RevokedRoleHolder, AutHExpectation::Deny),
                        (AuthMode::Stranger, AutHExpectation::Deny),
                    ],
                    expected_error: None,
                },
            ],
        },
    ]
}

/// Look up a seeded scenario by id.
pub fn seeded_scenario(id: &str) -> Option<AuthScenario> {
    seeded_scenarios().into_iter().find(|s | s.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test double that models a contract with a single role and an admin.
    /// State is carried between calls, so grant/revoke sequences are
    /// observed as true state transitions.
    struct RoleContract {
        role_granted: bool,
        wasm_upgraded: bool,
    }

    impl RoleContract {
        fn new() -> Self {
            Self {
                role_granted: false,
                wasm_upgraded: false,
            }
        }

        fn signer_is_admin(mode: AuthMode) -> bool {
            matches!(mode, AuthMode::Admin | AuthMode::MultiSigAdmin)
        }

        fn signer_is_role_holder(mode: AuthMode, granted: bool) -> bool {
            matches!(mode, AuthMode::RoleHolder) && granted
        }
    }

    impl AuthStepExecutor for RoleContract {
        fn execute_step(
            &mut self,
            step: &AuthStep,
            mode: AuthMode,
        ) -> Result<bool, String> {
            match step.action.as_str() {
                "grant_role" => {
                    if !Self::signer_is_admin(mode) {
                        return Ok(false);
                    }
                    self.role_granted = true;
                    Ok(true)
                }
                "revoke_role" => {
                    if !Self::signer_is_admin(mode) {
                        return Ok(false);
                    }
                    self.role_granted = false;
                    Ok(true)
                }
                "update_current_contract_wasm" => {
                    if !Self::signer_is_admin(mode) {
                    return Ok(false);
                    }
                    self.wasm_upgraded = true;
                    Ok(true)
                }
                "probe" => {
                    // Admin always passes; role holders only pass while the
                    // role is granted; everything else is denied.
                    if Self::signer_is_admin(mode) {
                        return Ok(true);
                    }
                    if Self::signer_is_role_holder(mode, self.role_granted) {
                        return Ok(true);
                    }
                    Ok(false)
                }
                other => Err(format!("unknown action {other}")),
            }
        }
    }

    fn run_seeded(id: &str) -> ScenarioResult {
        let scenario = seeded_scenario(id).expect("seeded scenario");
        let mut contract = RoleContract::new();
        run_scenario(&scenario, &mut contract)
    }

    #[test]
    fn grant_revoke_attempt_passes() {
        let result = run_seeded("grant_then_revoke_then_attempt");
        assert!(result.passed(), "divergences: {:?}", result.divergences);
    }

    #[test]
    fn upgrade_attempt_passes() {
        let result = run_seeded("upgrade_then_attempt");
        assert!(result.passed(), "divergences: {:?}", result.divergences);
    }

    #[test]
    fn sequence_replay_passes() {
        let result = run_seeeded("sequence_replay");
        assert!(result.passed(), "divergences: {:?}", result.divergences);
    }

    #[test]
    fn sequence_replay_is_deterministic() {
        let a = run_seeded("sequence_replay");
        let b = run_seeded("sequence_replay");
        assert_eq!(a.outcomes, b.outcomes);
        assert_eq!(a.divergences, b.divergences);
    }

    /// A contract that fails to revoke the role must be flagged as a
    /// `auth_state_divergence` at the probe step.
    struct LeakyRevokeContract {
        inner: RoleContract,
    }

    impl AuthStepExecutor for LeakyRevokeContract {
        fn execute_step(
            &mut self,
            step: &AuthStep,
            mode: AuthMode,
        ) -> Result<bool, String> {
            if step.action == "revoke_role" {
                // Bug: revoke is a no-op but reports success.
                if !RoleContract::signer_is_admin(mode) {
                    return Ok(false);
                }
                return Ok(true);
            }
            self.inner.execute_step(step, mode)
        }
    }

    #[test]
    fn leaky_revoke_detected() {
        let scenario = seeded_scenario("grant_then_revoke_then_attempt").unwrap();
        let mut contract = LeakyRevokeContract {
            inner: RoleContract::new(),
        };
        let result = run_scenario(&scenario, &mut contract);
        assert!(!result.passed());
        assert!(result.divergences.iter().all(|d | d.signature == AUTH_STATE_DIVERGENCE_SIGNATURE));
        assert!(result.divergences.iter().any(|d | d.step_name == "probe_revoked"));
    }

    /// A contract that drops auth enforcement after a wasm upgrade must be
    /// flagged at the post-upgrade probe.
    struct UpgradeDropsAuthContract {
        inner: RoleContract,
    }

    impl AuthStepExecutor for UpgradeDropsAuthContract {
        fn execute_step(
            &mut self,
            step: &AuthStep,
            mode: AuthMode,
        ) -> Result<bool, String> {
            if step.action == "probe" && self.inner.wasm_upgraded {
                // Bug: post-upgrade probe always allows.
                return Ok(true);
            }
            self.inner.execute_step(step, mode)
        }
    }

    #[test]
    fn upgrade_auth_drop_detected() {
        let scenario = seeded_scenario("upgrade_then_attempt").unwrap();
        let mut contract = UpgradeDropsAuthContract {
            inner: RoleContract::new(),
        };
        let result = run_scenario(&scenario, &mut contract);
        assert!(!result.passed());
        assert!(result.divergences.iter().any(|d | d.step_name == "probe_post_upgrade"));
    }

    #[test]
    find_seeded_by_id() {
        for s in seeded_scenarios() {
            assert!(seeded_scenario(&s.id).is_some());
        }
        assert!(seeded_scenario("nonexistent").is_none());
    }
}
