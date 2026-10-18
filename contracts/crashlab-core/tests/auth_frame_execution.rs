//! Integration tests for issue #1783: real Soroban auth frame execution.
//!
//! These tests verify that:
//!
//! 1. The seven [`AuthMode`] variants run through the *real* host invocation
//!    path (via [`HostContractRunner::run_seed_with_mode`]) rather than
//!    fabricating outcomes from payload bytes.
//! 2. `MissingAuth` is classified **only** when the host actually rejects a
//!    `require_auth` call — never inferred from the payload.
//! 3. A differential test confirms that the same seed produces a different
//!    signature under mock auth (Record) vs strict enforcement (Enforce with
//!    no declared signers).
//!
//! # W5-A02 coverage
//!
//! Every test that inspects the `"missing-auth"` category satisfies the
//! W5-A02 requirement: the diagnostic captures the *rejecting call site*
//! observed by the host, not a heuristic.

#![cfg(feature = "host-runner")]

use crashlab_core::{
    auth_matrix::{AuthFrameEntry, AuthMode, SignerSet, MISSING_AUTH_CATEGORY},
    CaseSeed, HostContractRunner,
};

// ── helpers ───────────────────────────────────────────────────────────────────

fn seed(id: u64, payload: Vec<u8>) -> CaseSeed {
    CaseSeed { id, payload }
}

fn runner() -> HostContractRunner {
    HostContractRunner::new()
}

// ── Matrix completeness ───────────────────────────────────────────────────────

/// Every one of the seven modes must produce a valid signature without
/// panicking. Regression guard: adding a new mode that crashes the host is
/// caught here.
#[test]
fn all_seven_modes_execute_without_panicking() {
    let r = runner();
    // op == 2 → transfer(admin, other, 1): calls require_auth on admin.
    let s = seed(1, vec![0x02, 0x01]);

    for &mode in &AuthMode::ALL {
        let result = r.run_seed_with_mode(&s, mode);
        assert!(
            result.is_ok(),
            "mode {mode} panicked or returned Err: {:?}",
            result.err()
        );
    }
}

/// Each mode must return a non-empty category.
#[test]
fn all_seven_modes_return_non_empty_category() {
    let r = runner();
    let s = seed(2, vec![0x02, 0x01]);

    for &mode in &AuthMode::ALL {
        let (sig, _diag) = r
            .run_seed_with_mode(&s, mode)
            .unwrap_or_else(|e| panic!("mode {mode} failed: {e}"));
        assert!(
            !sig.category.is_empty(),
            "mode {mode} returned empty category"
        );
    }
}

/// Signatures are deterministic: running the same seed twice under the same
/// mode must yield identical [`CrashSignature`] values.
#[test]
fn mode_signatures_are_deterministic() {
    let r = runner();
    let s = seed(3, vec![0x02, 0x01]);

    for &mode in &AuthMode::ALL {
        let (sig1, _) = r.run_seed_with_mode(&s, mode).unwrap();
        let (sig2, _) = r.run_seed_with_mode(&s, mode).unwrap();
        assert_eq!(
            sig1, sig2,
            "mode {mode} produced non-deterministic signatures"
        );
    }
}

// ── MissingAuth classification (W5-A02) ───────────────────────────────────────

/// `Enforce` with **no declared signers** on a transfer seed must produce
/// `missing-auth`. This is the primary W5-A02 requirement: classification
/// must come from the host, not from payload bytes.
#[test]
fn enforce_no_signers_transfer_classifies_as_missing_auth() {
    let r = runner();
    // op 2 → transfer: admin calls require_auth.
    let s = seed(10, vec![0x02, 0x01]);

    let (sig, diag) = r.run_seed_with_mode(&s, AuthMode::Enforce).unwrap();

    assert_eq!(
        sig.category, MISSING_AUTH_CATEGORY,
        "Enforce/no-signers/transfer must be missing-auth, got: {}",
        sig.category
    );
    assert!(diag.is_missing_auth(), "diagnostic must record missing-auth");
    assert_eq!(
        diag.rejecting_call_site.as_deref(),
        Some("transfer"),
        "rejecting call site must be 'transfer'"
    );
    assert_eq!(diag.signers, SignerSet::None);
}

/// `Enforce` with **no declared signers** on a burn seed must produce
/// `missing-auth`, recording `"burn"` as the call site.
#[test]
fn enforce_no_signers_burn_classifies_as_missing_auth() {
    let r = runner();
    // op 3 → burn: other calls require_auth.
    let s = seed(11, vec![0x03, 0x01]);

    let (sig, diag) = r.run_seed_with_mode(&s, AuthMode::Enforce).unwrap();

    assert_eq!(
        sig.category, MISSING_AUTH_CATEGORY,
        "Enforce/no-signers/burn must be missing-auth, got: {}",
        sig.category
    );
    assert!(diag.is_missing_auth());
    assert_eq!(diag.rejecting_call_site.as_deref(), Some("burn"));
}

/// `EnforceAdmin` declares admin as signer: transfer must **not** be
/// `missing-auth`. Auth passes; the actual failure (if any) is economic.
#[test]
fn enforce_admin_transfer_is_not_missing_auth() {
    let r = runner();
    // op 2, amount = 1 (within supply).
    let s = seed(12, vec![0x02, 0x01]);

    let (sig, diag) = r.run_seed_with_mode(&s, AuthMode::EnforceAdmin).unwrap();

    assert_ne!(
        sig.category, MISSING_AUTH_CATEGORY,
        "EnforceAdmin must accept require_auth for transfer; got: {}",
        sig.category
    );
    assert!(diag.authorized, "diagnostic must be authorized");
}

/// `EnforceOther` declares other as signer: burn auth passes, but other has
/// zero balance → the host traps with an economic error, not missing-auth.
#[test]
fn enforce_other_burn_is_not_missing_auth() {
    let r = runner();
    let s = seed(13, vec![0x03, 0x01]);

    let (sig, diag) = r.run_seed_with_mode(&s, AuthMode::EnforceOther).unwrap();

    assert_ne!(
        sig.category, MISSING_AUTH_CATEGORY,
        "EnforceOther must accept require_auth for burn; got: {}",
        sig.category
    );
    assert!(diag.authorized);
}

/// `Record` never rejects `require_auth`. No seed should produce `missing-auth`
/// under record mode.
#[test]
fn record_mode_never_produces_missing_auth() {
    let r = runner();
    let seeds = vec![
        seed(20, vec![0x02, 0x01]), // transfer
        seed(21, vec![0x03, 0x01]), // burn
        seed(22, vec![0x00]),        // total_supply (no require_auth)
        seed(23, vec![0x01]),        // initialize+balance (no require_auth)
    ];

    for s in &seeds {
        for &mode in &[AuthMode::Record, AuthMode::RecordAllowNonroot] {
            let (sig, _) = r
                .run_seed_with_mode(s, mode)
                .unwrap_or_else(|e| panic!("seed {} mode {mode} failed: {e}", s.id));
            assert_ne!(
                sig.category, MISSING_AUTH_CATEGORY,
                "Record-family mode {mode} must never emit missing-auth; got: {}",
                sig.category
            );
        }
    }
}

// ── Differential test (W5-A02) ────────────────────────────────────────────────

/// **Core differential test**: the same seed must produce *different*
/// signatures under mock auth (Record) versus strict enforcement (Enforce,
/// no signers) for a seed that calls `require_auth`.
///
/// If signatures were identical it would mean the runner is still fabricating
/// outcomes rather than deriving them from real host execution — exactly the
/// defect issue #1783 targets.
#[test]
fn differential_record_vs_enforce_diverges_for_auth_seed() {
    let r = runner();
    // Transfer (op 2): calls require_auth on admin.
    let s = seed(30, vec![0x02, 0x01]);

    let (sig_record, _) = r.run_seed_with_mode(&s, AuthMode::Record).unwrap();
    let (sig_enforce, diag_enforce) = r.run_seed_with_mode(&s, AuthMode::Enforce).unwrap();

    // Record: auth accepted → success or economic failure, never missing-auth.
    assert_ne!(
        sig_record.category, MISSING_AUTH_CATEGORY,
        "Record must not emit missing-auth"
    );
    // Enforce: auth rejected → missing-auth.
    assert_eq!(
        sig_enforce.category, MISSING_AUTH_CATEGORY,
        "Enforce/no-signers must emit missing-auth; got: {}",
        sig_enforce.category
    );
    // The two signatures must differ (the differential invariant).
    assert_ne!(
        sig_record.signature_hash, sig_enforce.signature_hash,
        "mock (Record) vs host (Enforce) signatures must diverge for an auth seed \
         — a match indicates the runner is still fabricating outcomes (W5-A02)"
    );
    // The diagnostic records the rejecting call site.
    assert!(diag_enforce.is_missing_auth());
    assert_eq!(
        diag_enforce.rejecting_call_site.as_deref(),
        Some("transfer")
    );
}

/// Seeds that do **not** call `require_auth` (op 0, 1) must produce the same
/// category under Record and Enforce, because there is no auth to reject.
#[test]
fn differential_no_require_auth_seeds_are_consistent_across_modes() {
    let r = runner();

    for (id, payload) in &[
        (40u64, vec![0x00u8]),        // total_supply on uninitialized → trap
        (41u64, vec![0x01u8]),        // initialize+balance → success
    ] {
        let s = seed(*id, payload.clone());
        let (sig_record, _) = r.run_seed_with_mode(&s, AuthMode::Record).unwrap();
        let (sig_enforce, _) = r.run_seed_with_mode(&s, AuthMode::Enforce).unwrap();

        assert_eq!(
            sig_record.category, sig_enforce.category,
            "seed {} (no require_auth): Record and Enforce must agree; \
             Record={} Enforce={}",
            id, sig_record.category, sig_enforce.category
        );
    }
}

// ── EnforceMockSigned (full verification path) ────────────────────────────────

/// `EnforceMockSigned` must build a real `SorobanAuthorizationEntry` and let
/// the host verify it. A transfer with admin+other declared should not be
/// `missing-auth`.
#[test]
fn enforce_mock_signed_transfer_not_missing_auth() {
    let r = runner();
    let s = seed(50, vec![0x02, 0x01]);

    let (sig, diag) = r
        .run_seed_with_mode(&s, AuthMode::EnforceMockSigned)
        .unwrap();

    assert_ne!(
        sig.category, MISSING_AUTH_CATEGORY,
        "EnforceMockSigned must run the full host verification path \
         and accept the mock-signed entry; got: {}",
        sig.category
    );
    assert!(diag.authorized);
}

// ── AuthFrameEntry diagnostics ────────────────────────────────────────────────

/// `AuthFrameEntry::authorized` must indicate no rejection.
#[test]
fn auth_frame_entry_authorized_semantics() {
    let entry = AuthFrameEntry::authorized(AuthMode::Record, SignerSet::None);
    assert!(entry.authorized);
    assert!(!entry.is_missing_auth());
    assert!(entry.rejecting_call_site.is_none());
    assert!(entry.rejecting_address.is_none());
}

/// `AuthFrameEntry::rejected` must record the call site and address.
#[test]
fn auth_frame_entry_rejected_semantics() {
    let entry = AuthFrameEntry::rejected(
        AuthMode::Enforce,
        SignerSet::None,
        "transfer",
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    assert!(!entry.authorized);
    assert!(entry.is_missing_auth());
    assert_eq!(entry.rejecting_call_site.as_deref(), Some("transfer"));
    assert!(entry.rejecting_address.is_some());
    // Display must mention missing-auth and the call site.
    let s = entry.to_string();
    assert!(s.contains("missing-auth"), "display: {s}");
    assert!(s.contains("transfer"), "display: {s}");
}

/// The `MISSING_AUTH_CATEGORY` constant must be the literal string
/// `"missing-auth"` for stable signature hashing across runs.
#[test]
fn missing_auth_category_is_stable_string() {
    assert_eq!(MISSING_AUTH_CATEGORY, "missing-auth");
}
