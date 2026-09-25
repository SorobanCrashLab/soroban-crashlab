#![cfg(test)]

use soroban_sdk::{map, symbol_short, Address, Env, Map};
use soroban_sdk::testutils::{Address as _, Ledger as _};

use crate::{ContractError, TokenContract, TokenContractClient};

/// Last ledger at which the grants in these tests may be spent. The default
/// test environment starts at ledger 0, so this is far in the future.
const EXPIRATION: u32 = 1_000;

// ── initialize ───────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);

    assert_eq!(client.total_supply(), 1000);
    assert_eq!(client.balance(&admin), 1000);
}

#[test]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_initialize(&admin, &1000),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

// ── transfer ─────────────────────────────────────────────────────────────────

#[test]
fn test_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
fn test_mint_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.burn(&admin, &admin, &200);

    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 800);
}

#[test]
fn test_burn_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&unauthorized, &user, &200),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn test_burn_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &admin, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_burn_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &admin, &-100),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_burn_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_burn(&admin, &admin, &2000),
        Err(Ok(ContractError::InsufficientBalance))
    );
}

// ── approve / allowance ───────────────────────────────────────────────────────

#[test]
fn test_approve_and_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);

    assert_eq!(client.allowance(&admin, &spender), 100);
}

#[test]
fn test_approve_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &0, &EXPIRATION);

    assert_eq!(client.allowance(&admin, &spender), 0);
}

#[test]
fn test_approve_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(
        client.try_approve(&admin, &spender, &-100, &EXPIRATION),
        Err(Ok(ContractError::InvalidAmount))
    );
}

// ── transfer_from ─────────────────────────────────────────────────────────────

#[test]
fn test_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    client.transfer_from(&spender, &admin, &user, &50);

    assert_eq!(client.balance(&admin), 950);
    assert_eq!(client.balance(&user), 50);
    assert_eq!(client.allowance(&admin, &spender), 50);
}

#[test]
fn test_transfer_from_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_from_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &-50),
        Err(Ok(ContractError::InvalidAmount))
    );
}

#[test]
fn test_transfer_from_insufficient_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &200),
        Err(Ok(ContractError::InsufficientAllowance))
    );
}

#[test]
fn test_transfer_from_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    // approve more than total_supply so allowance is not the constraint
    client.approve(&admin, &spender, &2000, &EXPIRATION);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let nonexistent = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(client.balance(&nonexistent), 0);
}

#[test]
fn test_allowance_of_nonexistent_pair() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    assert_eq!(client.allowance(&admin, &spender), 0);
}

#[test]
fn test_multiple_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
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
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(client.allowance(&admin, &spender), 100);

    client.approve(&admin, &spender, &200, &EXPIRATION);
    assert_eq!(client.allowance(&admin, &spender), 200);
}

// ── allowance expiration ──────────────────────────────────────────────────────

/// The raw storage behind an `(owner, spender)` grant: the approved amount and
/// the last ledger it is usable. Reads need the contract's own context, hence
/// `as_contract`, so tests can assert a grant was really deleted rather than
/// merely reported as 0.
fn stored_grant(
    env: &Env,
    contract_id: &Address,
    owner: &Address,
    spender: &Address,
) -> (Option<i128>, Option<u32>) {
    env.as_contract(contract_id, || {
        let key = (owner.clone(), spender.clone());
        let amounts: Option<Map<(Address, Address), i128>> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Allow"));
        let expirations: Option<Map<(Address, Address), u32>> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Exp"));
        (
            amounts.and_then(|amounts| amounts.get(key.clone())),
            expirations.and_then(|expirations| expirations.get(key)),
        )
    })
}

#[test]
fn test_allowance_is_usable_at_the_expiration_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);

    // The named ledger is the last usable one, matching the SAC's inclusive bound.
    env.ledger().with_mut(|ledger| ledger.sequence_number = EXPIRATION);

    assert_eq!(client.allowance(&admin, &spender), 100);
    client.transfer_from(&spender, &admin, &user, &40);
    assert_eq!(client.balance(&user), 40);
    assert_eq!(client.allowance(&admin, &spender), 60);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (Some(60), Some(EXPIRATION))
    );
}

#[test]
fn test_allowance_expires_after_the_expiration_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(client.allowance(&admin, &spender), 100);

    env.ledger().with_mut(|ledger| ledger.sequence_number = EXPIRATION + 1);

    assert_eq!(client.allowance(&admin, &spender), 0);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (None, None),
        "observing the lapse must delete the grant"
    );
}

#[test]
fn test_transfer_from_expired_allowance_returns_typed_error() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);

    env.ledger().with_mut(|ledger| ledger.sequence_number = EXPIRATION + 1);

    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &50),
        Err(Ok(ContractError::AllowanceExpired))
    );

    // Storage writes made by a call that returns an error are rolled back, so the
    // entry the lookup deleted is still there. The next successful call to observe
    // the lapse is what removes it for good.
    assert_eq!(client.allowance(&admin, &spender), 0);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (None, None)
    );
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &50),
        Err(Ok(ContractError::InsufficientAllowance)),
        "with the grant gone, the retry is an ordinary missing allowance"
    );
    assert_eq!(client.balance(&admin), 1000);
    assert_eq!(client.balance(&user), 0);
}

#[test]
fn test_approve_with_a_past_expiration_is_immediately_expired() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    env.ledger().with_mut(|ledger| ledger.sequence_number = 500);
    client.approve(&admin, &spender, &100, &499);

    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &50),
        Err(Ok(ContractError::AllowanceExpired)),
        "a grant that names a ledger in the past is already spent by neglect"
    );
    assert_eq!(client.allowance(&admin, &spender), 0);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (None, None)
    );
}

#[test]
fn test_approve_extends_the_expiration_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);

    env.ledger().with_mut(|ledger| ledger.sequence_number = EXPIRATION + 5);
    assert_eq!(client.allowance(&admin, &spender), 0, "lapsed");

    // Re-approving replaces both the amount and the expiration.
    client.approve(&admin, &spender, &200, &(EXPIRATION + 10));
    assert_eq!(client.allowance(&admin, &spender), 200);
}

#[test]
fn test_approve_zero_revokes_the_grant() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (Some(100), Some(EXPIRATION))
    );

    client.approve(&admin, &spender, &0, &EXPIRATION);

    assert_eq!(client.allowance(&admin, &spender), 0);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (None, None),
        "revoking must delete the grant entry"
    );
}

#[test]
fn test_transfer_from_spending_the_whole_grant_deletes_it() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);
    client.approve(&admin, &spender, &100, &EXPIRATION);
    client.transfer_from(&spender, &admin, &user, &100);

    assert_eq!(client.allowance(&admin, &spender), 0);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (None, None),
        "a fully spent grant must be deleted, not left as a zero entry"
    );
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &1),
        Err(Ok(ContractError::InsufficientAllowance))
    );
}

#[test]
fn test_grant_without_an_expiration_entry_is_lapsed() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &1000);

    // Storage as a build without expirations left it: an amount, and nothing
    // saying when it lapses.
    env.as_contract(&contract_id, || {
        let mut amounts: Map<(Address, Address), i128> = map![&env];
        amounts.set((admin.clone(), spender.clone()), 100);
        env.storage()
            .persistent()
            .set(&symbol_short!("Allow"), &amounts);
    });

    assert_eq!(
        client.allowance(&admin, &spender),
        0,
        "an amount that cannot say when it lapses must not be spendable"
    );
    assert_eq!(
        client.try_transfer_from(&spender, &admin, &user, &50),
        Err(Ok(ContractError::InsufficientAllowance))
    );

    // Approving again replaces the stale amount and gives it an expiration.
    client.approve(&admin, &spender, &50, &EXPIRATION);
    assert_eq!(client.allowance(&admin, &spender), 50);
    assert_eq!(
        stored_grant(&env, &contract_id, &admin, &spender),
        (Some(50), Some(EXPIRATION))
    );
}
