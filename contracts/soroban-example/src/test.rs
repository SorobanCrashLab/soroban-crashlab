#![cfg(test)]

use soroban_sdk::{Address, Env};
use soroban_sdk::testutils::Address as _;

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
fn test_initialize_requires_admin_authorization() {
    let env = Env::default();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    assert!(client.try_initialize(&admin, &1000).is_err());

    env.mock_all_auths();
    client.initialize(&admin, &1000);
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

#[test]
fn test_initialize_rejects_nonpositive_supply() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
    let admin = Address::generate(&env);

    assert_eq!(
        client.try_initialize(&admin, &0),
        Err(Ok(ContractError::InvalidAmount))
    );
    assert_eq!(
        client.try_initialize(&admin, &-100),
        Err(Ok(ContractError::InvalidAmount))
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
    client.burn(&admin, &admin, &200);

    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 800);
}

#[test]
fn test_burn_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
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
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
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
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
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
    let client = TokenContractClient::new(&env, &env.register(TokenContract, ()));
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
    client.approve(&admin, &spender, &0);

    assert_eq!(client.allowance(&admin, &spender), 0);
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
