#![cfg(test)]

use soroban_sdk::{Address, Env};
use soroban_sdk::testutils::Address as _;

use crate::{TokenContract, TokenContractClient};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);

    assert_eq!(client.total_supply(), total_supply);
    assert_eq!(client.balance(&admin), total_supply);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.initialize(&admin, &total_supply);
}

#[test]
fn test_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.transfer(&admin, &user, &100);

    assert_eq!(client.balance(&admin), 900);
    assert_eq!(client.balance(&user), 100);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_transfer_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.transfer(&admin, &user, &0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_transfer_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.transfer(&admin, &user, &-100);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.transfer(&admin, &user, &2000);
}

#[test]
fn test_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.mint(&admin, &user, &500);

    assert_eq!(client.total_supply(), 1500);
    assert_eq!(client.balance(&user), 500);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_mint_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.mint(&unauthorized, &user, &500);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_mint_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.mint(&admin, &user, &0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_mint_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.mint(&admin, &user, &-100);
}

#[test]
fn test_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.burn(&admin, &admin, &200);

    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 800);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_burn_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.burn(&unauthorized, &user, &200);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_burn_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.burn(&admin, &admin, &0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_burn_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.burn(&admin, &admin, &-100);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_burn_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.burn(&admin, &admin, &2000);
}

#[test]
fn test_approve_and_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);

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
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
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
#[should_panic(expected = "amount cannot be negative")]
fn test_approve_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &-100);
}

#[test]
fn test_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
    client.transfer_from(&spender, &admin, &user, &50);

    assert_eq!(client.balance(&admin), 950);
    assert_eq!(client.balance(&user), 50);
    assert_eq!(client.allowance(&admin, &spender), 50);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_transfer_from_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
    client.transfer_from(&spender, &admin, &user, &0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_transfer_from_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
    client.transfer_from(&spender, &admin, &user, &-50);
}

#[test]
#[should_panic(expected = "insufficient allowance")]
fn test_transfer_from_insufficient_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
    client.transfer_from(&spender, &admin, &user, &200);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_from_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let user = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &2000);
    client.transfer_from(&spender, &admin, &user, &1500);
}

#[test]
fn test_balance_of_nonexistent_account() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let nonexistent = Address::generate(&env);
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
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
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
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
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
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
    let total_supply = 1000;

    client.initialize(&admin, &total_supply);
    client.approve(&admin, &spender, &100);
    assert_eq!(client.allowance(&admin, &spender), 100);

    client.approve(&admin, &spender, &200);
    assert_eq!(client.allowance(&admin, &spender), 200);
}
