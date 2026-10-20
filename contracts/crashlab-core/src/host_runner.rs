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

use crate::runner::{ContractRunner, RunnerError};
use crate::{CaseSeed, CrashSignature, HostDiagnostics, HostErrorType, HostTrapOrigin};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::EnvTestConfig;
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
        }
    }

    /// Creates a runner with the given contract wasm bytes, bypassing the
    /// environment variable and bundled fixture.
    pub fn with_wasm(wasm: Vec<u8>) -> Self {
        Self {
            mock_auths: true,
            wasm: Some(wasm),
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
        }
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

        let outcome = run_seed_scenario(&env, &contract_id, seed);
        let digest = seed.payload.iter().fold(seed.id, |acc, b| {
            acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
        });
        let signature_hash = crate::signature_hash::hash_host_diagnostics(
            &outcome.category,
            &seed.payload,
            &outcome.diagnostics,
        );

        Ok(crate::HostInvocationOutcome {
            signature: CrashSignature {
                category: outcome.category,
                digest,
                signature_hash,
            },
            diagnostics: outcome.diagnostics,
        })
    }

    /// Runs a seed and returns the signature together with diagnostics captured
    /// directly from its Soroban host invocation.
    pub fn run_seed_with_diagnostics(
        &self,
        seed: &CaseSeed,
    ) -> Result<crate::HostInvocationOutcome, RunnerError> {
        self.execute_in_env(seed)
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
        // Burn by a non-admin account → typed contract authorization error.
        3 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(
                env,
                contract_id,
                "burn",
                &[other.to_val(), other.to_val(), amount.into_val(env)],
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
/// Where structured diagnostics identify a specific leaf it is used (`auth`,
/// `state`, or `trap_contract`); wasm VM traps become `trap`, and other host
/// errors use `host_error`.
fn host_error_category(diagnostics: &HostDiagnostics) -> String {
    if let Some(class) = diagnostics
        .budget_exhaustion
        .map(|exhaustion| match exhaustion {
            crate::BudgetExhaustion::Cpu => crate::taxonomy::FailureClass::BudgetExhaustedCpu,
            crate::BudgetExhaustion::Memory => crate::taxonomy::FailureClass::BudgetExhaustedMem,
        })
    {
        return class.as_str().to_string();
    }
    if diagnostics.trap_origin == Some(HostTrapOrigin::Contract) {
        return crate::taxonomy::FailureClass::TrapContract
            .as_str()
            .to_string();
    }
    match diagnostics.error_type {
        Some(HostErrorType::Auth) => crate::taxonomy::FailureClass::Auth.as_str().to_string(),
        Some(HostErrorType::Storage) => crate::taxonomy::FailureClass::State.as_str().to_string(),
        Some(HostErrorType::WasmVm | HostErrorType::Context) => "trap".to_string(),
        _ => crate::taxonomy::classify_host_diagnostics(diagnostics)
            .unwrap_or(crate::taxonomy::FailureClass::HostError)
            .as_str()
            .to_string(),
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
        // op == 3: `burn(other, other, 1)` — `other` is not the stored admin.
        let sig = runner
            .run_seed(&seed(4, vec![0x03, 0x01]))
            .expect("execution succeeded");
        assert_eq!(sig.category, "trap_contract");
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
}
