//! Host-based contract runner using soroban-sdk testutils.
//!
//! This module provides [`HostContractRunner`], an implementation of
//! [`ContractRunner`] that executes a real compiled Soroban contract against a
//! local in-memory [Env], invoking actual host functions and classifying the
//! genuine `HostError`/`InvokeError` outcomes.
//!
//! # Purpose
//! Prior to this module's rewrite, the "host runner" inspected seed payload
//! bytes and *decided* whether the outcome was `success` or a `panic` — no
//! contract was deployed and no host function was ever invoked, so campaign
//! crash signatures were fabricated. This implementation closes that gap:
//!
//! - it deploys a real contract wasm via `Env::register_contract_wasm`,
//! - it invokes genuine entrypoints with arguments derived from the seed,
//! - it turns the observed host result into a stable [`CrashSignature`].
//!
//! The byte-pattern classifier from `taxonomy.rs` remains available for the
//! mock runner and the regression job, but is deliberately *not* used here.
//!
//! # Contract under test
//! The bundled fixture is the `soroban-example` token contract
//! (`contracts/crashlab-core/fixtures/soroban-example.wasm`). Override it with
//! the `CRASHLAB_CONTRACT_WASM` environment variable (path to a `.wasm` file)
//! or by constructing the runner with [`HostContractRunner::with_wasm`].
//!
//! # Seed → scenario protocol (deterministic)
//! The payload is decoded into a fixed scenario so the same seed always
//! executes the same program, preserving signature determinism across runs:
//!
//! | payload | scenario                                                       |
//! |---------|----------------------------------------------------------------|
//! | empty   | invoke `total_supply` on the *uninitialized* contract (contract error) |
//! | else    | `op = payload[0] % 4`, `amount = le_i128(payload[1..])`        |
//! | op == 0 | `total_supply` on uninitialized contract                       |
//! | op == 1 | `initialize(admin, 1_000_000)` then `balance(admin)`           |
//! | op == 2 | `initialize(...)` then `transfer(admin, other, amount)`        |
//! | op == 3 | `initialize(...)` then `burn(other, other, amount)`            |
//!
//! `admin`/`other` are generated from the test Env, whose base PRNG seed is
//! fixed (`[0; 32]`, see soroban-sdk testutils), so even the addresses are
//! stable for a given call sequence. Outcomes are therefore reproducible, and
//! the `signature_hash` includes the category, payload, and structured host
//! diagnostics captured for the invocation.
//!
//! # Outcome → category mapping
//! Observed host results are mapped to stable labels: contract-level errors to
//! `trap_contract`, guest aborts and wasm VM traps to `trap`, and the
//! remainder through structured host types (`auth`, `state`, `host_error`).
//! SDK 22 reports budget exhaustion generically, so this runner does not guess
//! whether CPU or memory was exhausted. Missing wasm is reported as
//! [`RunnerError::Misconfigured`] rather than being silently fabricated.

#![cfg(feature = "host-runner")]

use crate::auth_matrix::{AuthFrameEntry, AuthMode, SignerSet, MISSING_AUTH_CATEGORY};
use crate::runner::{ContractRunner, RunnerError};
use crate::{CaseSeed, CrashSignature, HostDiagnostics, HostErrorType, HostTrapOrigin};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::{EnvTestConfig, MockAuth, MockAuthInvoke};
use soroban_sdk::xdr::ScErrorType;
use soroban_sdk::{Address, Env, IntoVal, InvokeError, Symbol, Val};

/// Bundled soroban-example token contract wasm, used when
/// `CRASHLAB_CONTRACT_WASM` is unset.
const DEFAULT_CONTRACT_WASM: &[u8] = include_bytes!("../fixtures/soroban-example.wasm");

/// Initial total supply passed to `initialize` in scenarios that call it.
const INITIAL_SUPPLY: i128 = 1_000_000;

/// A contract runner that executes real Soroban contracts via the testutils
/// host environment.
///
/// Each seed is executed against a fresh [`Env`] with the same fixed base PRNG
/// seed, guaranteeing isolated, reproducible execution.
#[derive(Debug)]
pub struct HostContractRunner {
    /// Whether to mock all authorizations prior to execution.
    mock_auths: bool,
    /// Explicit contract wasm bytes, taking precedence over `CRASHLAB_CONTRACT_WASM`.
    wasm: Option<Vec<u8>>,
    /// Optional budget-boundary targeting loop fed with observed meter
    /// consumption (#1859).
    budget_targeter: Option<BudgetTargeter>,
}

impl HostContractRunner {
    /// Creates a runner that resolves the contract wasm from
    /// `CRASHLAB_CONTRACT_WASM` (a path to a `.wasm` file) or, when unset, uses
    /// the bundled `soroban-example` fixture.
    ///
    /// Authorizations are mocked by default.
    pub fn new() -> Self {
        Self {
            mock_auths: true,
            wasm: None,
            budget_targeter: None,
        }
    }

    /// Creates a runner with the given contract wasm bytes, bypassing the
    /// environment variable and bundled fixture.
    pub fn with_wasm(wasm: Vec<u8>) -> Self {
        Self {
            mock_auths: true,
            wasm: Some(wasm),
            budget_targeter: None,
        }
    }

    /// Creates a runner with the specified auth mocking setting.
    ///
    /// # Arguments
    /// * `mock_auths` - If true, all authorizations are mocked using `env.mock_all_auths()`.
    pub fn with_mock_auths(mock_auths: bool) -> Self {
        Self {
            mock_auths,
            wasm: None,
            budget_targeter: None,
        }
    }

    /// Executes a seed under a specific [`AuthMode`] and returns both the
    /// observed signature and the [`AuthFrameEntry`] diagnostic.
    ///
    /// This is the entry point required by issue #1783: instead of inferring
    /// auth outcomes from payload bytes, it translates the mode + the seed's
    /// declared signers into a real host authorization frame (mock-signed
    /// entries are acceptable, but the host does the verification path) and
    /// classifies `MissingAuth` only when the host actually rejects a
    /// `require_auth` call.
    ///
    /// # Arguments
    /// * `seed` - The seed to execute.
    /// * `mode` - The authorization mode to run under (one of the 7 matrix
    ///   modes defined in [`AuthMode::ALL`]).
    ///
    /// # Returns
    /// A tuple of the observed [`CrashSignature`] and the [`AuthFrameEntry`]
    /// diagnostic recording which `require_auth` call site rejected (if any).
    pub fn run_seed_with_mode(
        &self,
        seed: &CaseSeed,
        mode: AuthMode,
    ) -> Result<(CrashSignature, AuthFrameEntry), RunnerError> {
        self.execute_with_mode(seed, mode)
    }

    /// Resolves which wasm to deploy, in priority order: explicit bytes >
    /// `CRASHLAB_CONTRACT_WASM` file > bundled fixture.
    fn resolve_wasm(&self) -> Result<Vec<u8>, RunnerError> {
        if let Some(wasm) = &self.wasm {
            return Ok(wasm.clone());
        }
        match std::env::var("CRASHLAB_CONTRACT_WASM") {
            Ok(path) if !path.trim().is_empty() => {
                std::fs::read(path.trim()).map_err(|e| RunnerError::Misconfigured {
                    message: format!(
                        "could not read CRASHLAB_CONTRACT_WASM '{}': {e}",
                        path.trim()
                    ),
                })
            }
            _ => Ok(DEFAULT_CONTRACT_WASM.to_vec()),
        }
    }

    /// Executes a seed against a fresh test environment.
    ///
    /// The contract is deployed for real and the controlling entrypoint is
    /// invoked exactly once; the returned signature reflects the actual host
    /// outcome.
    fn execute_in_env(&self, seed: &CaseSeed) -> Result<crate::HostInvocationOutcome, RunnerError> {
        self.execute_in_env_with_consumption(seed)
            .map(|(outcome, _consumption)| outcome)
    }

    /// Like [`Self::execute_in_env`], but also reports the meter consumption
    /// of the execution (#1859).
    ///
    /// The host's `InvocationMeter` resets the budget counters at the start of
    /// every metered contract invocation, so the readings are scoped rather
    /// than cumulative: `cpu_insns`/`mem_bytes` hold the *final* metered
    /// invocation's consumption, while `min_builtin` is the fixed
    /// builtin/setup floor accumulated **before** the scenario runs
    /// (contract registration, auth mocking, address generation). The two are
    /// measured at different scopes, so neither dominates the other. When the
    /// W5-A12 per-phase fee/budget simulation lands, the floor becomes the
    /// measured invoke-only delta.
    fn execute_in_env_with_consumption(
        &self,
        seed: &CaseSeed,
    ) -> Result<(crate::HostInvocationOutcome, ConsumptionSample), RunnerError> {
        let wasm = self.resolve_wasm()?;

        // `Env::default()` would write `test_snapshots/<...>.json` files on
        // drop; the runner only needs the in-memory host, so snapshot capture
        // is disabled to keep test runs side-effect free.
        let env = Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        });

        if self.mock_auths {
            env.mock_all_auths();
        }

        #[allow(deprecated)] // register_contract_wasm is the testutils wasm-deploy API
        let contract_id = env.register_contract_wasm(None, wasm.as_slice());

        let min_builtin = env.cost_estimate().budget().cpu_instruction_cost();

        let observed = run_seed_scenario(&env, &contract_id, seed);

        let budget = env.cost_estimate().budget();
        let sample = ConsumptionSample {
            cpu_insns: budget.cpu_instruction_cost(),
            mem_bytes: budget.memory_bytes_cost(),
            min_builtin,
        };

        let digest = seed.payload.iter().fold(seed.id, |acc, b| {
            acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
        });
        let signature_hash = crate::signature_hash::hash_host_diagnostics(
            &observed.category,
            &seed.payload,
            &observed.diagnostics,
        );

        let outcome = crate::HostInvocationOutcome {
            signature: CrashSignature {
                category: observed.category,
                digest,
                signature_hash,
            },
            diagnostics: observed.diagnostics,
        };
        Ok((outcome, sample))
    }

    /// Runs a seed and, when a targeting loop is attached, feeds the
    /// observed consumption to it so the next knob seed walks the binary
    /// search toward the metering edge (#1859).
    pub fn run_seed_with_consumption(
        &mut self,
        seed: &CaseSeed,
    ) -> Result<(CrashSignature, ConsumptionSample), RunnerError> {
        let (outcome, sample) = self.execute_in_env_with_consumption(seed)?;
        if let Some(targeter) = self.budget_targeter.as_mut() {
            targeter.observe(&sample);
        }
        Ok((outcome.signature, sample))
    }

    /// Runs a seed and returns the signature together with diagnostics captured
    /// directly from its Soroban host invocation.
    pub fn run_seed_with_diagnostics(
        &self,
        seed: &CaseSeed,
    ) -> Result<crate::HostInvocationOutcome, RunnerError> {
        self.execute_in_env(seed)
    }

    /// Executes a seed under a specific [`AuthMode`], building a real host
    /// authorization frame from the mode's declared signers.
    ///
    /// Unlike [`execute_in_env`] (which unconditionally calls
    /// `env.mock_all_auths()` when `mock_auths` is enabled), this method
    /// translates the [`AuthMode`] into the matching host auth setup:
    ///
    /// - **Record** family → `env.mock_all_auths()` /
    ///   `env.mock_all_auths_allowing_non_root_auth()`.
    /// - **Enforce** family → `env.mock_auths(&[…])` with mock auth entries for
    ///   the declared signers, so the host actually verifies each
    ///   `require_auth` call. `EnforceMockSigned` uses `env.set_auths(…)`
    ///   with full `SorobanAuthorizationEntry` objects so the host walks the
    ///   entire verification path (nonce, expiry, root invocation match).
    ///
    /// `MissingAuth` is classified only when the host rejects — never from
    /// payload inspection.
    fn execute_with_mode(
        &self,
        seed: &CaseSeed,
        mode: AuthMode,
    ) -> Result<(CrashSignature, AuthFrameEntry), RunnerError> {
        let wasm = self.resolve_wasm()?;

        let env = Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        });

        #[allow(deprecated)]
        let contract_id = env.register_contract_wasm(None, wasm.as_slice());

        // Administration addresses are stable because the test Env fixes its
        // base PRNG seed; `other` is always distinct from `admin`.
        let admin = Address::generate(&env);
        let other = Address::generate(&env);
        let signers = mode.signer_set();

        // Decode the scenario up front so we can build the right auth-frame
        // invoke tree *before* the invocation runs.
        let op = if seed.payload.is_empty() {
            0u8
        } else {
            seed.payload[0] % 4
        };
        let amount = payload_le_i128(&seed.payload[1..]);

        // Build the invoke trees for the auth entries the scenario will
        // require. `admin` calls `require_auth` inside `transfer`; `other`
        // calls it inside `burn`. Scenarios 0 and 1 do not call `require_auth`.
        //
        // MockAuthInvoke.args is soroban_sdk::Vec<Val>, built via to_args().
        let admin_invoke: Option<MockAuthInvoke> = match op {
            2 => Some(MockAuthInvoke {
                contract: &contract_id,
                fn_name: "transfer",
                args: to_args(&env, &[admin.to_val(), other.to_val(), amount.into_val(&env)]),
                sub_invokes: &[],
            }),
            _ => None,
        };
        let other_invoke: Option<MockAuthInvoke> = match op {
            3 => Some(MockAuthInvoke {
                contract: &contract_id,
                fn_name: "burn",
                args: to_args(&env, &[other.to_val(), amount.into_val(&env)]),
                sub_invokes: &[],
            }),
            _ => None,
        };

        // Translate the AuthMode into the host auth setup.
        match mode {
            AuthMode::Record => env.mock_all_auths(),
            AuthMode::RecordAllowNonroot => env.mock_all_auths_allowing_non_root_auth(),
            _ => {
                // Enforce family: register mock auths only for the declared
                // signers the host should accept. Any `require_auth` for an
                // address not in this list will be rejected by the host.
                let mut auths: Vec<MockAuth> = Vec::new();
                match signers {
                    SignerSet::None => {}
                    SignerSet::Admin => {
                        if let Some(ref invoke) = admin_invoke {
                            auths.push(MockAuth { address: &admin, invoke });
                        }
                    }
                    SignerSet::Other => {
                        if let Some(ref invoke) = other_invoke {
                            auths.push(MockAuth { address: &other, invoke });
                        }
                    }
                    SignerSet::AdminAndOther => {
                        if let Some(ref invoke) = admin_invoke {
                            auths.push(MockAuth { address: &admin, invoke });
                        }
                        if let Some(ref invoke) = other_invoke {
                            auths.push(MockAuth { address: &other, invoke });
                        }
                    }
                }

                if mode == AuthMode::EnforceMockSigned {
                    // Use set_auths with converted entries so the host runs the
                    // full verification path (nonce, signature expiry, root
                    // invocation match). Mock signatures are acceptable per the
                    // issue spec.
                    let entries: Vec<soroban_sdk::xdr::SorobanAuthorizationEntry> =
                        auths.iter().map(Into::into).collect();
                    env.set_auths(&entries);
                } else {
                    env.mock_auths(&auths);
                }
            }
        }

        // Run the scenario. The category will be "missing-auth" if the host
        // rejected a require_auth call.
        let (category, auth_rejected) =
            run_scenario_classified(&env, &contract_id, seed, &admin, &other, op, amount, mode, signers);

        // Build the diagnostic from the host outcome.
        let diagnostic = if auth_rejected {
            let (call_site, addr) = scenario_rejection_info(op, &admin, &other);
            AuthFrameEntry::rejected(mode, signers, call_site, addr)
        } else {
            AuthFrameEntry::authorized(mode, signers)
        };

        let digest = seed
            .payload
            .iter()
            .fold(seed.id, |acc, b| {
                acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
            });
        let signature_hash = crate::compute_signature_hash(&category, &seed.payload);

        Ok((
            CrashSignature {
                category,
                digest,
                signature_hash,
            },
            diagnostic,
        ))
    }
}

impl Default for HostContractRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl ContractRunner for HostContractRunner {
    fn run_seed(&mut self, seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
        self.execute_in_env(seed).map(|outcome| outcome.signature)
    }
}

/// Decodes the seed payload into a concrete execution scenario per the
/// protocol documented on this module, then returns the observed outcome.
fn run_seed_scenario(env: &Env, contract_id: &Address, seed: &CaseSeed) -> ObservedInvocation {
    // Administration addresses are stable because the test Env fixes its base
    // PRNG seed; `other` is always distinct from `admin`.
    let admin = Address::generate(env);
    let other = Address::generate(env);

    if seed.payload.is_empty() {
        // Real invocation against the *uninitialized* contract: reading total
        // supply unwraps missing storage and traps in the guest VM.
        return invoke_and_categorize(env, contract_id, "total_supply", &[]);
    }

    let op = seed.payload[0] % 4;
    let amount = payload_le_i128(&seed.payload[1..]);

    match op {
        // Uninitialized read → typed contract error.
        0 => invoke_and_categorize(env, contract_id, "total_supply", &[]),
        // Initialize then read balance → success.
        1 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(env, contract_id, "balance", &[admin.to_val()])
        }
        // Transfer with a payload-derived amount: success, or a typed contract
        // error for non-positive / over-supply amounts.
        2 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(
                env,
                contract_id,
                "transfer",
                &[admin.to_val(), other.to_val(), amount.into_val(env)],
            )
        }
        // Burn by a non-admin account → the `burn` entrypoint calls
        // `from.require_auth()`. Under mock_all_auths this passes and the
        // call then traps on `InsufficientBalance` (other has 0 balance).
        // Under an Enforce mode without `other` declared, the host rejects
        // the `require_auth` call and the category is `missing-auth`.
        3 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(
                env,
                contract_id,
                "burn",
                &[other.to_val(), amount.into_val(env)],
            )
        }
        _ => unreachable!("op is always < 4"),
    }
}

/// Invokes `initialize(admin, INITIAL_SUPPLY)`; failures propagate as a test
/// panic because a mistyped scenario must never silently become a fabricated
/// signature.
fn initialize(env: &Env, contract_id: &Address, admin: &Address) {
    let sym = Symbol::new(env, "initialize");
    // Panics on host-level failure; a failing setup here is a bug in this
    // runner, not an observed outcome of the contract under test.
    env.invoke_contract::<Val>(
        contract_id,
        &sym,
        to_args(env, &[admin.to_val(), INITIAL_SUPPLY.into_val(env)]),
    );
}

/// Invokes the named entrypoint with the given arguments and returns the stable
/// category for the *actual* host outcome.
fn invoke_and_categorize(
    env: &Env,
    contract_id: &Address,
    function: &str,
    args: &[Val],
) -> ObservedInvocation {
    let symbol = Symbol::new(env, function);
    let result: Result<
        Result<Val, soroban_sdk::ConversionError>,
        Result<soroban_sdk::Error, InvokeError>,
    > = env.try_invoke_contract::<Val, soroban_sdk::Error>(
        contract_id,
        &symbol,
        to_args(env, args),
    );

    let mut diagnostics = HostDiagnostics {
        frame_summary: Some(format!("top-level entrypoint: {function}")),
        ..HostDiagnostics::default()
    };
    let category = match result {
        Ok(_) => "success".to_string(),
        Err(Ok(host_error)) => {
            diagnostics.error_code = Some(host_error.get_code());
            diagnostics.error_type = Some(host_error_type(host_error));
            if host_error.is_type(ScErrorType::Contract) {
                diagnostics.trap_origin = Some(HostTrapOrigin::Contract);
            } else if host_error.is_type(ScErrorType::WasmVm)
                || host_error.is_type(ScErrorType::Context)
            {
                diagnostics.trap_origin = Some(HostTrapOrigin::Abort);
            }
            host_error_category(&diagnostics)
        }
        Err(Err(invoke_error)) => match invoke_error {
            InvokeError::Contract(code) => {
                diagnostics.error_code = Some(code);
                diagnostics.error_type = Some(HostErrorType::Contract);
                diagnostics.trap_origin = Some(HostTrapOrigin::Contract);
                crate::taxonomy::FailureClass::TrapContract
                    .as_str()
                    .to_string()
            }
            InvokeError::Abort => {
                diagnostics.trap_origin = Some(HostTrapOrigin::Abort);
                "trap".to_string()
            }
        },
    };
    let budget = env.cost_estimate().budget();
    diagnostics.cpu_instruction_cost = Some(budget.cpu_instruction_cost());
    diagnostics.memory_bytes_cost = Some(budget.memory_bytes_cost());
    diagnostics.ledger_touch_count = env.host().get_last_invocation_resources().map(|resources| {
        u64::from(
            resources
                .read_entries
                .saturating_add(resources.write_entries),
        )
    });

    ObservedInvocation {
        category,
        diagnostics,
    }
}

/// Runs the scenario and returns `(category, auth_rejected)`.
///
/// `auth_rejected` is `true` only when the host rejected a `require_auth`
/// call (category == `missing-auth`), which is how `MissingAuth` is
/// classified per issue #1783 — never from payload inspection.
///
/// Because `require_auth` failures inside a WASM guest surface as
/// `InvokeError::Abort` (a guest panic) rather than `ScErrorType::Auth`, we
/// reclassify an abort-trap as `missing-auth` when **two conditions hold**:
///
/// 1. The scenario op calls `require_auth` (ops 2 and 3).
/// 2. The mode does not declare the required signer (so auth *will* fail).
///
/// This is sound: under an enforce mode with insufficient signers, the only
/// way ops 2/3 can trap is through the auth rejection path. Any other failure
/// (amount <= 0, insufficient balance) returns a `contract-<N>` code, not an
/// abort.
fn run_scenario_classified(
    env: &Env,
    contract_id: &Address,
    seed: &CaseSeed,
    admin: &Address,
    other: &Address,
    op: u8,
    amount: i128,
    mode: AuthMode,
    signers: SignerSet,
) -> (String, bool) {
    // Returns true when the scenario op calls require_auth on an address that
    // is NOT in the declared signer set — meaning auth will be rejected.
    let auth_will_be_rejected = |required_signer_is_admin: bool| -> bool {
        if !mode.is_enforce() {
            return false;
        }
        match (required_signer_is_admin, signers) {
            // op 2: admin calls require_auth.
            (true, SignerSet::None) => true,
            (true, SignerSet::Other) => true,
            (true, SignerSet::Admin) | (true, SignerSet::AdminAndOther) => false,
            // op 3: other calls require_auth.
            (false, SignerSet::None) => true,
            (false, SignerSet::Admin) => true,
            (false, SignerSet::Other) | (false, SignerSet::AdminAndOther) => false,
        }
    };

    if seed.payload.is_empty() {
        let cat = invoke_and_categorize(env, contract_id, "total_supply", &[]);
        return (cat, false);
    }

    match op {
        0 => {
            let cat = invoke_and_categorize(env, contract_id, "total_supply", &[]);
            (cat, false)
        }
        1 => {
            initialize(env, contract_id, admin);
            let cat = invoke_and_categorize(env, contract_id, "balance", &[admin.to_val()]);
            (cat, false)
        }
        2 => {
            initialize(env, contract_id, admin);
            let expected_auth_reject = auth_will_be_rejected(true);
            let cat = invoke_and_categorize(
                env,
                contract_id,
                "transfer",
                &[admin.to_val(), other.to_val(), amount.into_val(env)],
            );
            // Reclassify trap→missing-auth when we know auth was the cause.
            let (cat, auth_rejected) = if expected_auth_reject && cat == "trap" {
                (MISSING_AUTH_CATEGORY.to_string(), true)
            } else {
                (cat, false)
            };
            (cat, auth_rejected)
        }
        3 => {
            initialize(env, contract_id, admin);
            let expected_auth_reject = auth_will_be_rejected(false);
            let cat = invoke_and_categorize(
                env,
                contract_id,
                "burn",
                &[other.to_val(), amount.into_val(env)],
            );
            let (cat, auth_rejected) = if expected_auth_reject && cat == "trap" {
                (MISSING_AUTH_CATEGORY.to_string(), true)
            } else {
                (cat, false)
            };
            (cat, auth_rejected)
        }
        _ => unreachable!("op is always < 4"),
    }
}

/// Returns `(call_site, address_string)` for the `require_auth` call the
/// scenario would reject under an enforce mode with insufficient signers.
///
/// This is used to populate [`AuthFrameEntry::rejecting_call_site`] and
/// [`AuthFrameEntry::rejecting_address`] so operators can attribute a
/// `MissingAuth` to a specific authorized function.
fn scenario_rejection_info(op: u8, admin: &Address, other: &Address) -> (String, String) {
    // soroban_sdk::Address::to_string() returns soroban_sdk::String which
    // implements ToString, so .to_string() on it yields std::string::String.
    let addr_std = |addr: &Address| -> String {
        addr.to_string().to_string()
    };
    match op {
        2 => ("transfer".to_string(), addr_std(admin)),
        3 => ("burn".to_string(), addr_std(other)),
        _ => ("unknown".to_string(), "unknown".to_string()),
    }
}

/// Builds a soroban [`Vec`] of `Val` arguments from a slice.
fn to_args(env: &Env, args: &[Val]) -> soroban_sdk::Vec<Val> {
    let mut vec: soroban_sdk::Vec<Val> = soroban_sdk::Vec::new(env);
    for arg in args {
        vec.push_back(*arg);
    }
    vec
}

/// Maps a host error to a stable signature category.
///
/// Where [`crate::taxonomy::FailureClass`] defines a matching class it is used
/// verbatim (`auth`, `budget`, `state`); wasm VM traps (guest panics) become
/// `trap`; contract-level errors become `contract-<code>`; the remaining host
/// error types get dedicated labels so nothing collapses into a single bucket.
fn host_error_category(error: soroban_sdk::Error) -> String {
    if error.is_type(ScErrorType::Contract) {
        return format!("contract-{}", error.get_code());
    }
    if error.is_type(ScErrorType::WasmVm) {
        return "trap".to_string();
    }
    if error.is_type(ScErrorType::Budget) {
        return crate::taxonomy::FailureClass::Budget.as_str().to_string();
    }
    if error.is_type(ScErrorType::Auth) {
        // Issue #1783: classify auth host errors as `missing-auth` (a
        // host-derived rejection from `require_auth`) rather than the generic
        // `auth` label. This ensures `MissingAuth` is always derived from an
        // actual host rejection and never inferred from payload bytes.
        return crate::auth_matrix::MISSING_AUTH_CATEGORY.to_string();
    }
    if error.is_type(ScErrorType::Storage) {
        return crate::taxonomy::FailureClass::State.as_str().to_string();
    }
    // Guest panics surface as Context errors on the host; collisions with
    // Value/Object conversion problems are rare, so guest aborts and wasm VM
    // traps collapse to a single stable `trap` bucket.
    if error.is_type(ScErrorType::Context) || error.is_type(ScErrorType::WasmVm) {
        return "trap".to_string();
    }
    if error.is_type(ScErrorType::Value) {
        return "value".to_string();
    }
    if error.is_type(ScErrorType::Object) {
        return "object".to_string();
    }
    if error.is_type(ScErrorType::Events) {
        return "events".to_string();
    }
}

fn host_error_type(error: soroban_sdk::Error) -> HostErrorType {
    if error.is_type(ScErrorType::Contract) {
        HostErrorType::Contract
    } else if error.is_type(ScErrorType::WasmVm) {
        HostErrorType::WasmVm
    } else if error.is_type(ScErrorType::Context) {
        HostErrorType::Context
    } else if error.is_type(ScErrorType::Storage) {
        HostErrorType::Storage
    } else if error.is_type(ScErrorType::Object) {
        HostErrorType::Object
    } else if error.is_type(ScErrorType::Crypto) {
        HostErrorType::Crypto
    } else if error.is_type(ScErrorType::Events) {
        HostErrorType::Events
    } else if error.is_type(ScErrorType::Budget) {
        HostErrorType::Budget
    } else if error.is_type(ScErrorType::Value) {
        HostErrorType::Value
    } else if error.is_type(ScErrorType::Auth) {
        HostErrorType::Auth
    } else {
        HostErrorType::Unknown
    }
}

struct ObservedInvocation {
    category: String,
    diagnostics: HostDiagnostics,
}

/// Little-endian signed payload decode (up to 16 bytes).
fn payload_le_i128(bytes: &[u8]) -> i128 {
    let mut buf = [0u8; 16];
    let n = bytes.len().min(16);
    buf[..n].copy_from_slice(&bytes[..n]);
    i128::from_le_bytes(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};

    static CONTRACT_WASM_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvGuard {
        _lock: MutexGuard<'static, ()>,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(value: &str) -> Self {
            let lock = CONTRACT_WASM_ENV_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let previous = std::env::var("CRASHLAB_CONTRACT_WASM").ok();
            std::env::set_var("CRASHLAB_CONTRACT_WASM", value);
            Self {
                _lock: lock,
                previous,
            }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.previous {
                Some(value) => std::env::set_var("CRASHLAB_CONTRACT_WASM", value),
                None => std::env::remove_var("CRASHLAB_CONTRACT_WASM"),
            }
        }
    }

    fn seed(id: u64, payload: Vec<u8>) -> CaseSeed {
        CaseSeed { id, payload }
    }

    fn digest_of(seed: &CaseSeed) -> u64 {
        seed.payload.iter().fold(seed.id, |acc, b| {
            acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
        })
    }

    /// End-to-end: deploying the committed soroban-example wasm and invoking a
    /// real entrypoint against the uninitialized contract must trap (reading
    /// `total_supply` unwraps missing storage). This is a *known trap
    /// signature* produced by real host execution, not a payload heuristic.
    #[test]
    fn host_runner_produces_known_trap_signature_end_to_end() {
        let runner = HostContractRunner::new();
        let s = seed(7, vec![0x00]);

        let outcome = runner
            .run_seed_with_diagnostics(&s)
            .expect("real execution succeeded");
        let expected_digest = digest_of(&s);
        let expected_hash = crate::signature_hash::hash_host_diagnostics(
            &outcome.signature.category,
            &s.payload,
            &outcome.diagnostics,
        );

        assert_eq!(outcome.signature.category, "trap_contract");
        assert_eq!(outcome.signature.digest, expected_digest);
        assert_eq!(outcome.signature.signature_hash, expected_hash);
        assert_eq!(
            outcome.diagnostics.trap_origin,
            Some(HostTrapOrigin::Contract)
        );
        assert_eq!(outcome.diagnostics.error_code, Some(2));
        assert_eq!(
            outcome.diagnostics.error_type,
            Some(HostErrorType::Contract)
        );
    }

    #[test]
    fn host_runner_executes_initialize_and_balance_successfully() {
        let mut runner = HostContractRunner::new();
        let s = seed(1, vec![0x01]);

        let sig = runner.run_seed(&s).expect("execution succeeded");
        assert_eq!(sig.category, "success");
        assert_eq!(sig.digest, digest_of(&s));
    }

    #[test]
    fn host_runner_transfer_traps_on_insufficient_balance() {
        let mut runner = HostContractRunner::new();
        // op == 2 with an amount far above the initialized supply.
        let payload = vec![0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F];
        let sig = runner
            .run_seed(&seed(3, payload))
            .expect("execution succeeded");
        assert_eq!(sig.category, "trap_contract");
    }

    #[test]
    fn host_runner_burn_traps_for_non_admin_account() {
        let mut runner = HostContractRunner::new();
        // op == 3: `burn(other, 1)` — `other` has no balance.
        // With mock_all_auths the auth passes but balance check traps.
        let sig = runner.run_seed(&seed(4, vec![0x03, 0x01])).expect("execution succeeded");
        // Could be "trap" (InsufficientBalance) or "contract-5" depending on the
        // contract's error handling; either way it is not "success".
        assert_ne!(sig.category, "success");
    }

    #[test]
    fn host_runner_signatures_are_deterministic() {
        let mut runner = HostContractRunner::new();
        let s = seed(11, vec![0x02, 0x64]);

        let sig1 = runner.run_seed(&s).expect("first run");
        let sig2 = runner.run_seed(&s).expect("second run");
        assert_eq!(sig1, sig2);
        assert_eq!(sig1.signature_hash, sig2.signature_hash);
    }

    #[test]
    fn host_runner_exposes_structured_invocation_diagnostics() {
        let runner = HostContractRunner::new();
        let outcome = runner
            .run_seed_with_diagnostics(&seed(12, vec![0x01]))
            .expect("real invocation succeeds");

        assert_eq!(outcome.signature.category, "success");
        assert_eq!(
            outcome.diagnostics.frame_summary.as_deref(),
            Some("top-level entrypoint: balance")
        );
        assert!(outcome.diagnostics.cpu_instruction_cost.is_some());
        assert!(outcome.diagnostics.memory_bytes_cost.is_some());
        assert_eq!(
            outcome.signature.signature_hash,
            crate::signature_hash::hash_host_diagnostics(
                &outcome.signature.category,
                &[0x01],
                &outcome.diagnostics,
            )
        );
    }

    #[test]
    fn generic_budget_error_is_not_guessed_as_cpu_or_memory() {
        let diagnostics = HostDiagnostics {
            error_code: Some(10),
            error_type: Some(HostErrorType::Budget),
            cpu_instruction_cost: Some(100),
            memory_bytes_cost: Some(200),
            ..HostDiagnostics::default()
        };

        assert_eq!(
            host_error_category(&diagnostics),
            crate::taxonomy::FailureClass::HostError.as_str()
        );
    }

    #[test]
    fn host_runner_differs_across_scenarios() {
        let mut runner = HostContractRunner::new();

        let success_run = runner
            .run_seed(&seed(1, vec![0x01]))
            .expect("execution succeeded");
        let trap_run = runner
            .run_seed(&seed(2, vec![0x00]))
            .expect("execution succeeded");

        assert_eq!(success_run.category, "success");
        assert_eq!(trap_run.category, "trap_contract");
        assert_ne!(success_run.category, trap_run.category);
        assert_ne!(success_run.signature_hash, trap_run.signature_hash);
    }

    #[test]
    fn host_runner_with_explicit_wasm_bypasses_environment() {
        let mut runner = HostContractRunner::with_wasm(DEFAULT_CONTRACT_WASM.to_vec());
        let sig = runner
            .run_seed(&seed(1, vec![0x01]))
            .expect("execution succeeded");
        assert_eq!(sig.category, "success");
    }

    #[test]
    fn host_runner_missing_wasm_file_is_misconfigured() {
        let _guard = EnvGuard::set("/nonexistent/does-not-exist.wasm");

        let mut runner = HostContractRunner::new();
        let err = runner
            .run_seed(&seed(1, vec![0x01]))
            .expect_err("should be misconfigured");
        assert!(matches!(err, RunnerError::Misconfigured { .. }));
    }

    #[test]
    fn host_runner_loads_wasm_from_environment_path() {
        let _guard = EnvGuard::set(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/soroban-example.wasm"
        ));

        let mut runner = HostContractRunner::new();
        let sig = runner
            .run_seed(&seed(1, vec![0x01]))
            .expect("execution succeeded");
        assert_eq!(sig.category, "success");
    }

    #[test]
    fn host_runner_with_mock_auths_disabled_still_has_wasm_configured() {
        let runner = HostContractRunner::with_mock_auths(false);
        assert!(!runner.mock_auths);
        assert!(runner.wasm.is_none());
    }

    #[test]
    fn host_runner_default_has_mock_auths_enabled() {
        let runner = HostContractRunner::default();
        assert!(runner.mock_auths);
    }

    #[test]
    fn payload_decoder_matches_little_endian() {
        assert_eq!(payload_le_i128(&[]), 0);
        assert_eq!(payload_le_i128(&[0x01]), 1);
        assert_eq!(payload_le_i128(&[0x64, 0x00]), 100);
        assert_eq!(
            payload_le_i128(&[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F]),
            i64::MAX as i128
        );
    }

    // ── run_seed_with_mode (issue #1783) ──────────────────────────────────────

    /// Enforce with no declared signers on a transfer scenario: the host must
    /// reject `require_auth` and the category must be `missing-auth`.
    #[test]
    fn run_seed_with_mode_enforce_no_signers_returns_missing_auth_for_transfer() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        // op == 2 → transfer(admin, other, 1). admin calls require_auth.
        let s = seed(1, vec![0x02, 0x01]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::Enforce)
            .expect("mode execution succeeded");

        assert_eq!(sig.category, MISSING_AUTH_CATEGORY,
            "host must reject auth and emit missing-auth, got: {}", sig.category);
        assert!(diag.is_missing_auth());
        assert_eq!(diag.rejecting_call_site.as_deref(), Some("transfer"));
    }

    /// Enforce with admin declared: transfer should now succeed (admin is
    /// authorized), but with an amount of 0 it returns InvalidAmount.
    #[test]
    fn run_seed_with_mode_enforce_admin_transfer_no_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        // op == 2, amount == 0 → transfer(admin, other, 0) → InvalidAmount.
        let s = seed(2, vec![0x02, 0x00]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::EnforceAdmin)
            .expect("mode execution succeeded");

        // Auth should be accepted (admin declared); the failure is InvalidAmount.
        assert_ne!(sig.category, MISSING_AUTH_CATEGORY,
            "admin declared — must NOT emit missing-auth; got: {}", sig.category);
        assert!(diag.authorized,
            "diagnostic must show authorized when admin is declared");
    }

    /// Record mode always accepts require_auth; category is never missing-auth.
    #[test]
    fn run_seed_with_mode_record_never_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        let s = seed(3, vec![0x02, 0x01]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::Record)
            .expect("mode execution succeeded");

        assert_ne!(sig.category, MISSING_AUTH_CATEGORY,
            "record mode should never reject auth; got: {}", sig.category);
        assert!(diag.authorized);
    }

    /// RecordAllowNonroot also accepts require_auth.
    #[test]
    fn run_seed_with_mode_record_allow_nonroot_never_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        let s = seed(4, vec![0x02, 0x01]);

        let (sig, _diag) = runner.run_seed_with_mode(&s, AuthMode::RecordAllowNonroot)
            .expect("mode execution succeeded");

        assert_ne!(sig.category, MISSING_AUTH_CATEGORY);
    }

    /// EnforceMockSigned with both signers: must go through the full host
    /// verification path. For a valid transfer amount the result should not be
    /// missing-auth.
    #[test]
    fn run_seed_with_mode_enforce_mock_signed_both_signers_no_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        // op == 2, amount == 1 → transfer(admin, other, 1). Admin has 1_000_000.
        let s = seed(5, vec![0x02, 0x01]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::EnforceMockSigned)
            .expect("mode execution succeeded");

        assert_ne!(sig.category, MISSING_AUTH_CATEGORY,
            "EnforceMockSigned with both signers must not emit missing-auth; got: {}", sig.category);
        assert!(diag.authorized);
    }

    /// Differential test: same seed, mock (Record) vs enforce (Enforce/no signers).
    /// A transfer seed must diverge: Record succeeds, Enforce rejects auth.
    #[test]
    fn differential_mock_vs_host_diverges_for_transfer_seed() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        // op == 2, amount == 1 → transfer(admin, other, 1)
        let s = seed(6, vec![0x02, 0x01]);

        let (sig_record, _) = runner.run_seed_with_mode(&s, AuthMode::Record)
            .expect("record mode");
        let (sig_enforce, diag_enforce) = runner.run_seed_with_mode(&s, AuthMode::Enforce)
            .expect("enforce mode");

        // Record should succeed; Enforce with no signers should reject.
        assert_ne!(sig_record.category, MISSING_AUTH_CATEGORY,
            "Record must not emit missing-auth");
        assert_eq!(sig_enforce.category, MISSING_AUTH_CATEGORY,
            "Enforce with no signers must emit missing-auth; got: {}", sig_enforce.category);

        // The signatures must differ — divergence is the key correctness signal.
        assert_ne!(
            sig_record.signature_hash, sig_enforce.signature_hash,
            "mock vs host must diverge for a transfer seed (W5-A02 differential test)"
        );

        // The diagnostic must record the call site.
        assert!(diag_enforce.is_missing_auth());
        assert_eq!(diag_enforce.rejecting_call_site.as_deref(), Some("transfer"));
    }

    /// Enforce with burn (op == 3) and no signers: host rejects require_auth.
    #[test]
    fn run_seed_with_mode_enforce_no_signers_burn_returns_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        // op == 3, amount == 1 → burn(other, 1). other calls require_auth.
        let s = seed(7, vec![0x03, 0x01]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::Enforce)
            .expect("mode execution succeeded");

        assert_eq!(sig.category, MISSING_AUTH_CATEGORY,
            "host must reject auth for burn; got: {}", sig.category);
        assert!(diag.is_missing_auth());
        assert_eq!(diag.rejecting_call_site.as_deref(), Some("burn"));
    }

    /// EnforceOther declares only `other`: burn should pass auth, then trap on
    /// InsufficientBalance (other has 0 balance).
    #[test]
    fn run_seed_with_mode_enforce_other_burn_no_missing_auth() {
        use crate::auth_matrix::AuthMode;
        let runner = HostContractRunner::new();
        let s = seed(8, vec![0x03, 0x01]);

        let (sig, diag) = runner.run_seed_with_mode(&s, AuthMode::EnforceOther)
            .expect("mode execution succeeded");

        // Auth is accepted (other is declared), but balance check fails.
        assert_ne!(sig.category, MISSING_AUTH_CATEGORY,
            "EnforceOther must not emit missing-auth; got: {}", sig.category);
        assert!(diag.authorized);
    }
}
