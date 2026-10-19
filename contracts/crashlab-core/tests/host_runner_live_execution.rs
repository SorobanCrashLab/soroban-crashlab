//! Live host-runner execution over the real WASM fixture (#1781).
//!
//! Every assertion below observes a genuinely deployed contract invoked
//! through the Soroban host; no payload-byte classification is involved.

#![cfg(feature = "host-runner")]

use crashlab_core::{CaseSeed, ContractRunner, HostContractRunner};

fn seed(id: u64, payload: Vec<u8>) -> CaseSeed {
    CaseSeed { id, payload }
}

#[test]
fn live_uninitialized_read_traps() {
    let mut runner = HostContractRunner::new();
    let sig = runner.run_seed(&seed(7, vec![0x00])).expect("real execution");
    assert_eq!(sig.category, "trap");
}

#[test]
fn live_initialize_then_balance_succeeds() {
    let mut runner = HostContractRunner::new();
    let sig = runner.run_seed(&seed(1, vec![0x01])).expect("real execution");
    assert_eq!(sig.category, "success");
}

#[test]
fn live_transfer_over_supply_traps() {
    let mut runner = HostContractRunner::new();
    let payload = vec![0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F];
    let sig = runner.run_seed(&seed(3, payload)).expect("real execution");
    assert_eq!(sig.category, "trap");
}

#[test]
fn live_burn_by_non_admin_traps() {
    let mut runner = HostContractRunner::new();
    let sig = runner.run_seed(&seed(4, vec![0x03, 0x01])).expect("real execution");
    assert_eq!(sig.category, "trap");
}

#[test]
fn live_registry_resolves_bundled_wasm() {
    let wasm = crashlab_core::load_bundled_fixture_wasm().expect("bundled fixture");
    assert!(wasm.starts_with(b"\0asm"), "must be a real wasm module");
    let resolved =
        crashlab_core::resolve_fixture_wasm(&seed(99, vec![0x01])).expect("registry resolve");
    assert_eq!(resolved, wasm);
}

#[test]
fn live_wasm_hash_verification_rejects_tampered_bytes() {
    let wasm = crashlab_core::load_bundled_fixture_wasm().expect("bundled fixture");
    let mut tampered = wasm.clone();
    let last = tampered.len() - 1;
    tampered[last] ^= 0xFF;
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&wasm);
    let good_hex = hex::encode(hasher.finalize());
    assert!(crashlab_core::verify_wasm_sha256(&wasm, &good_hex).is_ok());
    assert!(crashlab_core::verify_wasm_sha256(&tampered, &good_hex).is_err());
}
