#![cfg(test)]

extern crate std;

use std::vec;
use std::vec::Vec;

use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::xdr::ToXdr as _;
use soroban_sdk::{symbol_short, Address, Bytes, Env, FromVal, IntoVal, TryIntoVal, Val};

use crate::{ContractError, TokenContract, TokenContractClient};

// ── initialize ───────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    assert_eq!(client.total_supply(), 1000);
    assert_eq!(client.balance(&admin), 1000);
}

#[test]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_initialize(&admin, &1000),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

// ── version ──────────────────────────────────────────────────────────────────

#[test]
fn test_version() {
    assert_eq!(TokenContract::version(), 1);
}

// ── admin rotation ───────────────────────────────────────────────────────────

#[test]
fn test_admin_rotation_happy_path() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    // Current admin should be the one who initialized
    assert_eq!(client.admin(), admin);

    // Set new admin
    client.set_admin(&admin, &new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    // Accept admin role
    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_set_admin_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    // Unauthorized user tries to set admin
    assert_eq!(
        client.try_set_admin(&unauthorized, &new_admin),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn test_set_admin_auth_records_stored_admin_not_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    // An unauthorized caller supplying their own address must be rejected
    // before auth is requested for the attacker-supplied address.
    assert_eq!(
        client.try_set_admin(&unauthorized, &new_admin),
        Err(Ok(ContractError::Unauthorized))
    );
    assert_eq!(env.auths(), std::vec::Vec::new());

    // When the valid admin calls set_admin, auth is recorded for the stored admin.
    client.set_admin(&admin, &new_admin);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
fn test_accept_admin_must_be_pending() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.set_admin(&admin, &new_admin);

    // Wrong admin tries to accept
    assert_eq!(
        client.try_accept_admin(&wrong_admin),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn test_accept_admin_no_pending() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    // No pending admin to accept
    assert_eq!(
        client.try_accept_admin(&new_admin),
        Err(Ok(ContractError::NoPendingAdmin))
    );
}

// ── transfer ─────────────────────────────────────────────────────────────────

#[test]
fn test_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user, &100);

    assert_eq!(client.balance(&admin), 900);
    assert_eq!(client.balance(&user), 100);
}

#[test]
fn test_transfer_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_transfer(&admin, &user, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_transfer(&admin, &user, &-100),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_transfer(&admin, &user, &2000),
        Err(Ok(ContractError::InsufficientBalance))
    );
}

// ── mint ─────────────────────────────────────────────────────────────────────

#[test]
fn test_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.mint(&admin, &user, &500);

    assert_eq!(client.total_supply(), 1500);
    assert_eq!(client.balance(&user), 500);
}

#[test]
fn test_mint_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_mint(&unauthorized, &user, &500),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn test_mint_auth_records_stored_admin_not_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &1000);

    // An unauthorized caller supplying their own address must be rejected
    // before auth is requested for the attacker-supplied address.
    assert_eq!(
        client.try_mint(&unauthorized, &user, &500),
        Err(Ok(ContractError::Unauthorized))
    );
    assert_eq!(env.auths(), std::vec::Vec::new());

    // When the valid admin calls mint, auth is recorded for the stored admin.
    client.mint(&admin, &user, &500);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
fn test_mint_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_mint(&admin, &user, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_mint_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_mint(&admin, &user, &-100),
        Err(Ok(ContractError::InvalidAmount))
    );
}

// ── burn ─────────────────────────────────────────────────────────────────────

#[test]
fn test_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.burn(&admin, &200);

    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 800);
}

#[test]
fn test_admin_burn_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user, &200);
    assert_eq!(
        client.try_admin_burn(&unauthorized, &user, &100),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn test_admin_burn_auth_records_stored_admin_not_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user, &200);

    // An unauthorized caller supplying their own address must be rejected
    // before auth is requested for the attacker-supplied address.
    assert_eq!(
        client.try_admin_burn(&unauthorized, &user, &100),
        Err(Ok(ContractError::Unauthorized))
    );
    assert_eq!(env.auths(), std::vec::Vec::new());

    // When the valid admin calls admin_burn, auth is recorded for the stored admin.
    client.admin_burn(&admin, &user, &100);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
fn test_admin_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user, &200);
    client.admin_burn(&admin, &user, &100);

    assert_eq!(client.total_supply(), 900);
    assert_eq!(client.balance(&user), 100);
}

#[test]
fn test_burn_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_burn_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &-100),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_burn_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &2000),
        Err(Ok(ContractError::InsufficientBalance))
    );
}

// ── approve / allowance ───────────────────────────────────────────────────────

#[test]
fn test_approve_and_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);

    assert_eq!(client.allowance(&admin, &spender), 100);
}

#[test]
fn test_approve_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    assert_eq!(client.allowance(&admin, &spender), 100);

    client.approve(&admin, &spender, &0);
    assert_eq!(client.allowance(&admin, &spender), 0);
}

#[test]
fn test_balances_are_sharded_for_one_thousand_accounts() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1000);

    for _ in 0..1000 {
        let account = Address::generate(&env);
        client.transfer(&admin, &account, &1);
        assert_eq!(client.balance(&account), 1);
    }

    assert_eq!(client.balance(&admin), 0);
}

#[test]
fn test_approve_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_approve(&admin, &spender, &-100),
        Err(Ok(ContractError::InvalidAmount))
    );
}

// ── transfer_from ─────────────────────────────────────────────────────────────

#[test]
fn test_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    client.transfer_from(&spender, &admin, &user, &50);

    assert_eq!(client.balance(&admin), 950);
    assert_eq!(client.balance(&user), 50);
    assert_eq!(client.allowance(&admin, &spender), 50);
}

#[test]
fn test_transfer_from_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_from_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &-50),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_from_insufficient_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &200),
        Err(Ok(ContractError::InsufficientAllowance))
    );
}

#[test]
fn test_transfer_from_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    // approve more than total_supply so allowance is not the constraint
    client.approve(&admin, &spender, &2000);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &1500),
        Err(Ok(ContractError::InsufficientBalance))
    );
}

// ── edge cases ────────────────────────────────────────────────────────────────

#[test]
fn test_balance_of_nonexistent_account() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let nonexistent = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(client.balance(&nonexistent), 0);
}

#[test]
fn test_allowance_of_nonexistent_pair() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(client.allowance(&admin, &spender), 0);
}

#[test]
fn test_multiple_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user1, &200);
    client.transfer(&admin, &user2, &300);
    client.transfer(&user1, &user2, &50);

    assert_eq!(client.balance(&admin), 500);
    assert_eq!(client.balance(&user1), 150);
    assert_eq!(client.balance(&user2), 350);
}

#[test]
fn test_update_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);
    assert_eq!(client.allowance(&admin, &spender), 100);

    client.approve(&admin, &spender, &200);
    assert_eq!(client.allowance(&admin, &spender), 200);
}

// ── supply invariant ─────────────────────────────────────────────────────────

/// `total_supply` must always equal the sum of all balances, so the checked
/// arithmetic above can never let value appear or disappear silently.
#[test]
fn test_supply_equals_sum_of_balances() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.initialize(&admin, &1000);

    client.transfer(&admin, &alice, &250);
    assert_eq!(client.total_supply(), 1000);

    client.transfer(&alice, &bob, &100);
    client.mint(&admin, &bob, &500);
    client.burn(&alice, &50);
    client.approve(&admin, &bob, &300);
    client.transfer_from(&bob, &admin, &alice, &300);

    let mut sum: i128 = 0;
    for account in [&admin, &alice, &bob].iter() {
        sum = sum
            .checked_add(client.balance(*account))
            .expect("balance sum overflowed");
    }

    assert_eq!(sum, client.total_supply());
    assert_eq!(sum, 1450);
}

// ── events ───────────────────────────────────────────────────────────────────
//
// Every state transition must be observable off-chain, so each entrypoint that
// mutates state is asserted to publish exactly one typed event with the
// documented topic/data split:
//
//   transfer  topics: [transfer, from, to]      data: amount
//   mint      topics: [mint, to]                data: amount
//   burn      topics: [burn, from]              data: amount
//   approve   topics: [approve, owner, spender] data: (amount, expiration)
//   init      topics: [init, admin]             data: total_supply
//   admin_set topics: [admin_set, admin]        data: new_admin
//   admin_acc topics: [admin_acc, new_admin]    data: new_admin
//
// In the SDK test host `env.events().all()` reports only the events published by
// the *current* invocation frame: each call through a client replaces the
// previous frame's contents rather than appending to it. An assertion therefore
// has to be made immediately after the call it describes, and a test that needs
// the whole history has to accumulate the frames itself. That is what
// [`EventRecorder`] does — it asserts per call and keeps its own copy, so a
// missing event and a duplicated one both fail.

/// One published event, with the host topic vector copied into a plain one.
type PublishedEvent = (Address, Vec<Val>, Val);

/// `Val` deliberately has no `PartialEq`, so event values are compared through
/// their canonical XDR form, which is a stable value identity across the host
/// boundary.
fn val_key(val: &Val, env: &Env) -> Bytes {
    val.to_xdr(env)
}

fn topic_keys(topics: &[Val], env: &Env) -> Vec<Bytes> {
    topics.iter().map(|t| val_key(t, env)).collect()
}

/// Collects a test's event stream frame by frame.
///
/// The host only ever exposes one frame at a time, so [`Self::expect_one`] and
/// [`Self::expect_none`] are called straight after the invocation they describe,
/// while [`Self::record`] appends a frame to the history for tests that assert
/// on the accumulated sequence.
struct EventRecorder {
    history: Vec<PublishedEvent>,
}

impl EventRecorder {
    fn new() -> Self {
        EventRecorder {
            history: Vec::new(),
        }
    }

    /// The events published by the invocation that has just returned.
    fn frame(env: &Env) -> Vec<PublishedEvent> {
        env.events()
            .all()
            .iter()
            .map(|(publisher, topics, data)| (publisher.clone(), topics.iter().collect(), data))
            .collect()
    }

    /// Assert the last invocation published exactly one event, by `contract`,
    /// with these topics and data, and append it to the history.
    fn expect_one(&mut self, env: &Env, contract: &Address, topics: Vec<Val>, data: Val) {
        let frame = Self::frame(env);
        assert_eq!(
            frame.len(),
            1,
            "expected exactly one event from this call, saw {}",
            frame.len()
        );
        let (publisher, actual_topics, actual_data) = frame[0].clone();
        assert_eq!(
            publisher, *contract,
            "event published by the wrong contract"
        );
        assert_eq!(
            topic_keys(&actual_topics, env),
            topic_keys(&topics, env),
            "unexpected event topics"
        );
        assert_eq!(
            val_key(&actual_data, env),
            val_key(&data, env),
            "unexpected event data"
        );
        self.history.push((publisher, actual_topics, actual_data));
    }

    /// Assert the last invocation published nothing, and record that.
    fn expect_none(&mut self, env: &Env) {
        let frame = Self::frame(env);
        assert_eq!(
            frame.len(),
            0,
            "expected no events from this call, saw {}",
            frame.len()
        );
    }

    /// Assert the last invocation published exactly `count` events and append
    /// them all to the history.
    fn expect_count(&mut self, env: &Env, count: usize) {
        let frame = Self::frame(env);
        assert_eq!(
            frame.len(),
            count,
            "expected {} events from this call, saw {}",
            count,
            frame.len()
        );
        self.history.extend(frame);
    }

    /// Everything recorded so far.
    fn history(&self) -> &[PublishedEvent] {
        &self.history
    }
}

#[test]
fn test_initialize_emits_init_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    events.expect_one(
        &env,
        &contract_id,
        vec![symbol_short!("init").into_val(&env), admin.into_val(&env)],
        1000i128.into_val(&env),
    );
}

#[test]
fn test_transfer_emits_transfer_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    client.transfer(&admin, &user, &100);

    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("transfer").into_val(&env),
            admin.into_val(&env),
            user.into_val(&env),
        ],
        100i128.into_val(&env),
    );
}

#[test]
fn test_mint_emits_mint_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    client.mint(&admin, &user, &500);

    events.expect_one(
        &env,
        &contract_id,
        vec![symbol_short!("mint").into_val(&env), user.into_val(&env)],
        500i128.into_val(&env),
    );
}

#[test]
fn test_burn_emits_burn_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    client.burn(&admin, &200);

    events.expect_one(
        &env,
        &contract_id,
        vec![symbol_short!("burn").into_val(&env), admin.into_val(&env)],
        200i128.into_val(&env),
    );
}

/// An admin-forced burn reuses the `burn` shape, so an indexer needs only one
/// handler for every supply reduction.
#[test]
fn test_admin_burn_emits_burn_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);
    client.transfer(&admin, &user, &200);

    client.admin_burn(&admin, &user, &100);

    events.expect_one(
        &env,
        &contract_id,
        vec![symbol_short!("burn").into_val(&env), user.into_val(&env)],
        100i128.into_val(&env),
    );
}

#[test]
fn test_approve_emits_approve_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    client.approve(&admin, &spender, &100);

    // `expiration` is the SEP-41 expiry ledger. This contract's allowances have
    // no TTL, so it is always 0 ("no expiry").
    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("approve").into_val(&env),
            admin.into_val(&env),
            spender.into_val(&env),
        ],
        (100i128, 0u32).into_val(&env),
    );
}

/// Revoking an allowance is a state change too, so it must be observable.
#[test]
fn test_approve_revocation_emits_approve_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);

    client.approve(&admin, &spender, &0);

    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("approve").into_val(&env),
            admin.into_val(&env),
            spender.into_val(&env),
        ],
        (0i128, 0u32).into_val(&env),
    );
}

/// An allowance spend is a transfer, so it publishes `transfer`; the spender is
/// already visible in the invocation's auth entries.
#[test]
fn test_transfer_from_emits_transfer_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100);

    client.transfer_from(&spender, &admin, &user, &50);

    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("transfer").into_val(&env),
            admin.into_val(&env),
            user.into_val(&env),
        ],
        50i128.into_val(&env),
    );
}

#[test]
fn test_admin_rotation_emits_events() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    client.set_admin(&admin, &new_admin);
    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("admin_set").into_val(&env),
            admin.into_val(&env),
        ],
        new_admin.into_val(&env),
    );

    client.accept_admin(&new_admin);
    events.expect_one(
        &env,
        &contract_id,
        vec![
            symbol_short!("admin_acc").into_val(&env),
            new_admin.into_val(&env),
        ],
        new_admin.into_val(&env),
    );
}

/// A reverted invocation must leave no trace: no event, no partial state.
#[test]
fn test_failed_calls_emit_no_events() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    assert!(client.try_transfer(&admin, &user, &2000).is_err());
    assert_eq!(client.balance(&admin), 1000);
    events.expect_none(&env);

    assert!(client.try_mint(&unauthorized, &user, &1).is_err());
    assert_eq!(client.total_supply(), 1000);
    events.expect_none(&env);

    assert!(client.try_burn(&admin, &2000).is_err());
    assert_eq!(client.total_supply(), 1000);
    events.expect_none(&env);

    assert!(client.try_approve(&admin, &user, &-1).is_err());
    events.expect_none(&env);

    assert!(client.try_initialize(&admin, &1).is_err());
    assert_eq!(client.total_supply(), 1000);
    events.expect_none(&env);
}

/// Read-only calls must not publish anything.
#[test]
fn test_read_only_calls_emit_no_events() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);

    assert_eq!(client.total_supply(), 1000);
    assert_eq!(client.balance(&admin), 1000);
    assert_eq!(client.balance(&user), 0);
    assert_eq!(client.allowance(&admin, &user), 0);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.pending_admin(), None);

    events.expect_none(&env);
}

/// The point of the change: an off-chain observer can reconstruct a run purely
/// from the event stream, with no storage reads.
#[test]
fn test_full_run_is_reconstructable_from_events_alone() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let spender = Address::generate(&env);
    let mut events = EventRecorder::new();

    client.initialize(&admin, &1000);
    events.expect_one(
        &env,
        &contract_id,
        vec![symbol_short!("init").into_val(&env), admin.into_val(&env)],
        1000i128.into_val(&env),
    );

    // Each subsequent call is recorded as it returns, because the host only
    // keeps the latest frame; the history is what an off-chain indexer would
    // rebuild.
    client.transfer(&admin, &alice, &250);
    events.expect_count(&env, 1);
    client.mint(&admin, &bob, &500);
    events.expect_count(&env, 1);
    client.approve(&alice, &spender, &100);
    events.expect_count(&env, 1);
    client.transfer_from(&spender, &alice, &bob, &100);
    events.expect_count(&env, 1);
    client.burn(&bob, &50);
    events.expect_count(&env, 1);

    let published = events.history();
    let names: Vec<Bytes> = published
        .iter()
        .map(|(_, topics, _)| val_key(&topics[0], &env))
        .collect();

    assert_eq!(
        names,
        vec![
            symbol_short!("init").to_xdr(&env),
            symbol_short!("transfer").to_xdr(&env),
            symbol_short!("mint").to_xdr(&env),
            symbol_short!("approve").to_xdr(&env),
            symbol_short!("transfer").to_xdr(&env),
            symbol_short!("burn").to_xdr(&env),
        ],
        "event stream did not match the expected sequence of state changes"
    );

    for (publisher, _, _) in published {
        assert_eq!(*publisher, contract_id);
    }

    // The approve event is a state change too, so it appears in the stream even
    // though it moves no tokens. Balances are only reconcilable if it does not
    // perturb them, which is what the reconstruction below checks.
    // `Address` has interior mutability so it cannot key a `BTreeMap`; the
    // account is tracked as a plain list, which is all a three-party run needs.
    fn credit(account: Address, delta: i128, balances: &mut Vec<(Address, i128)>) {
        match balances.iter_mut().find(|(a, _)| *a == account) {
            Some((_, balance)) => *balance += delta,
            None => balances.push((account, delta)),
        }
    }

    let mut supply: i128 = 0;
    let mut balances: Vec<(Address, i128)> = Vec::new();

    for (_, topics, data) in published {
        let name = val_key(&topics[0], &env);
        // `approve` carries a tuple payload, so each branch decodes the shape
        // its own event documents rather than assuming a bare amount.
        if name == symbol_short!("transfer").to_xdr(&env) {
            let amount: i128 = data.try_into_val(&env).unwrap();
            let from = Address::from_val(&env, &topics[1]);
            let to = Address::from_val(&env, &topics[2]);
            credit(from, -amount, &mut balances);
            credit(to, amount, &mut balances);
        } else if name == symbol_short!("mint").to_xdr(&env)
            || name == symbol_short!("init").to_xdr(&env)
        {
            let amount: i128 = data.try_into_val(&env).unwrap();
            let to = Address::from_val(&env, &topics[1]);
            credit(to, amount, &mut balances);
            supply += amount;
        } else if name == symbol_short!("burn").to_xdr(&env) {
            let amount: i128 = data.try_into_val(&env).unwrap();
            let from = Address::from_val(&env, &topics[1]);
            credit(from, -amount, &mut balances);
            supply -= amount;
        }
    }

    assert_eq!(supply, client.total_supply());
    for (account, expected) in &balances {
        assert_eq!(client.balance(account), *expected, "balance mismatch");
    }
}
