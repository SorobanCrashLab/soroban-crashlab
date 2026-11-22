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
//! | empty   | invoke `total_supply` on the *uninitialized* contract (traps)  |
//! | else    | `op = payload[0] % 4`, `amount = le_i128(payload[1..])`        |
//! | op == 0 | `total_supply` on uninitialized contract                       |
//! | op == 1 | `initialize(admin, 1_000_000)` then `balance(admin)`           |
//! | op == 2 | `initialize(...)` then `transfer(admin, other, amount)`        |
//! | op == 3 | `initialize(...)` then `burn(other, other, amount)`            |
//!
//! `admin`/`other` are generated from the test Env, whose base PRNG seed is
//! fixed (`[0; 32]`, see soroban-sdk testutils), so even the addresses are
//! stable for a given call sequence. Outcomes are therefore reproducible, and
//! the `signature_hash` derives from `category + payload` only.
//!
//! # Outcome → category mapping
//! Observed host results are mapped to stable labels: contract-level errors to
//! `contract-<code>`, guest aborts and wasm VM traps to `trap`, and the
//! remainder through [`crate::taxonomy::FailureClass`] where a class exists
//! (`auth`, `budget`, `state`), with dedicated labels for the rest (`value`,
//! `object`, ...). Missing wasm is reported as [`RunnerError::Misconfigured`]
//! rather than being silently fabricated.

#![cfg(feature = "host-runner")]

use crate::runner::{ContractRunner, RunnerError};
use crate::{CaseSeed, CrashSignature};
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
            Ok(path) if !path.trim().is_empty() => std::fs::read(path.trim()).map_err(|e| {
                RunnerError::Misconfigured {
                    message: format!("could not read CRASHLAB_CONTRACT_WASM '{}': {e}", path.trim()),
                }
            }),
            _ => Ok(DEFAULT_CONTRACT_WASM.to_vec()),
        }
    }

    /// Executes a seed against a fresh test environment.
    ///
    /// The contract is deployed for real and the controlling entrypoint is
    /// invoked exactly once; the returned signature reflects the actual host
    /// outcome.
    fn execute_in_env(&self, seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
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

        let category = run_seed_scenario(&env, &contract_id, seed);
        let digest = seed
            .payload
            .iter()
            .fold(seed.id, |acc, b| acc.wrapping_mul(1099511628211).wrapping_add(*b as u64));
        let signature_hash = crate::compute_signature_hash(&category, &seed.payload);

        Ok(CrashSignature {
            category,
            digest,
            signature_hash,
        })
    }
}

impl Default for HostContractRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl ContractRunner for HostContractRunner {
    fn run_seed(&mut self, seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
        self.execute_in_env(seed)
    }
}

/// Decodes the seed payload into a concrete execution scenario per the
/// protocol documented on this module, then returns the observed category.
fn run_seed_scenario(env: &Env, contract_id: &Address, seed: &CaseSeed) -> String {
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
        // Uninitialized read → guest trap.
        0 => invoke_and_categorize(env, contract_id, "total_supply", &[]),
        // Initialize then read balance → success.
        1 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(env, contract_id, "balance", &[admin.to_val()])
        }
        // Transfer with a payload-derived amount: success, or trap for
        // non-positive / over-supply amounts.
        2 => {
            initialize(env, contract_id, &admin);
            invoke_and_categorize(
                env,
                contract_id,
                "transfer",
                &[admin.to_val(), other.to_val(), amount.into_val(env)],
            )
        }
        // Burn by a non-admin account → authorization trap.
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
) -> String {
    let symbol = Symbol::new(env, function);
    let result: Result<
        Result<Val, soroban_sdk::ConversionError>,
        Result<soroban_sdk::Error, InvokeError>,
    > = env.try_invoke_contract::<Val, soroban_sdk::Error>(contract_id, &symbol, to_args(env, args));

    match result {
        Ok(_) => "success".to_string(),
        Err(Ok(host_error)) => host_error_category(host_error),
        Err(Err(invoke_error)) => match invoke_error {
            InvokeError::Contract(code) => format!("contract-{code}"),
            InvokeError::Abort => "trap".to_string(),
        },
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
        return crate::taxonomy::FailureClass::Auth.as_str().to_string();
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
    if error.is_type(ScErrorType::Crypto) {
        return "crypto".to_string();
    }
    "unknown".to_string()
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
            Self { _lock: lock, previous }
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
        seed.payload
            .iter()
            .fold(seed.id, |acc, b| acc.wrapping_mul(1099511628211).wrapping_add(*b as u64))
    }

    /// End-to-end: deploying the committed soroban-example wasm and invoking a
    /// real entrypoint against the uninitialized contract must trap (reading
    /// `total_supply` unwraps missing storage). This is a *known trap
    /// signature* produced by real host execution, not a payload heuristic.
    #[test]
    fn host_runner_produces_known_trap_signature_end_to_end() {
        let mut runner = HostContractRunner::new();
        let s = seed(7, vec![0x00]);

        let sig = runner.run_seed(&s).expect("real execution succeeded");
        let expected_digest = digest_of(&s);
        let expected_hash = crate::compute_signature_hash(&sig.category, &s.payload);

        assert_eq!(sig.category, "trap");
        assert_eq!(sig.digest, expected_digest);
        assert_eq!(sig.signature_hash, expected_hash);
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
        let sig = runner.run_seed(&seed(3, payload)).expect("execution succeeded");
        assert_eq!(sig.category, "trap");
    }

    #[test]
    fn host_runner_burn_traps_for_non_admin_account() {
        let mut runner = HostContractRunner::new();
        // op == 3: `burn(other, other, 1)` — `other` is not the stored admin.
        let sig = runner.run_seed(&seed(4, vec![0x03, 0x01])).expect("execution succeeded");
        assert_eq!(sig.category, "trap");
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
    fn host_runner_differs_across_scenarios() {
        let mut runner = HostContractRunner::new();

        let success_run = runner.run_seed(&seed(1, vec![0x01])).expect("execution succeeded");
        let trap_run = runner.run_seed(&seed(2, vec![0x00])).expect("execution succeeded");

        assert_eq!(success_run.category, "success");
        assert_eq!(trap_run.category, "trap");
        assert_ne!(success_run.category, trap_run.category);
        assert_ne!(success_run.signature_hash, trap_run.signature_hash);
    }

    #[test]
    fn host_runner_with_explicit_wasm_bypasses_environment() {
        let mut runner = HostContractRunner::with_wasm(DEFAULT_CONTRACT_WASM.to_vec());
        let sig = runner.run_seed(&seed(1, vec![0x01])).expect("execution succeeded");
        assert_eq!(sig.category, "success");
    }

    #[test]
    fn host_runner_missing_wasm_file_is_misconfigured() {
        let _guard = EnvGuard::set("/nonexistent/does-not-exist.wasm");

        let mut runner = HostContractRunner::new();
        let err = runner.run_seed(&seed(1, vec![0x01])).expect_err("should be misconfigured");
        assert!(matches!(err, RunnerError::Misconfigured { .. }));
    }

    #[test]
    fn host_runner_loads_wasm_from_environment_path() {
        let _guard = EnvGuard::set(
            concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/soroban-example.wasm"),
        );

        let mut runner = HostContractRunner::new();
        let sig = runner.run_seed(&seed(1, vec![0x01])).expect("execution succeeded");
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
