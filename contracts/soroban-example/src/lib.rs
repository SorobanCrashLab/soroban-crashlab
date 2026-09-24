#![no_std]
use soroban_sdk::{
    contract, contractimpl,
    symbol_short,
    Address, Env,
};

/// Storage layout version. Version 2 stores each balance and allowance in a
/// separate persistent entry. Deployments using version 1 require an explicit
/// migration before calling this contract; no automatic migration is provided.
pub const STORAGE_VERSION: u32 = 2;

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Initialize the token with a total supply and assign it to the admin
    pub fn initialize(env: Env, admin: Address, total_supply: i128) {
        if env.storage().persistent().has(&symbol_short!("Init")) {
            panic!("already initialized");
        }

        env.storage().persistent().set(
            &symbol_short!("Admin"),
            &admin,
        );
        env.storage().persistent().set(
            &symbol_short!("Supply"),
            &total_supply,
        );

        env.storage().persistent().set(
            &(symbol_short!("Bal"), admin),
            &total_supply,
        );

        env.storage().persistent().set(
            &symbol_short!("Init"),
            &true,
        );
    }

    /// Get the total supply of tokens
    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .unwrap()
    }

    /// Get the balance of an account
    pub fn balance(env: Env, account: Address) -> i128 {
        env
            .storage()
            .persistent()
            .get(&(symbol_short!("Bal"), account))
            .unwrap_or(0)
    }

    /// Transfer tokens from one account to another
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }

        Self::set_balance(&env, from, from_balance - amount);
        let to_balance = Self::balance(env.clone(), to.clone());
        Self::set_balance(&env, to, to_balance + amount);
    }

    /// Mint new tokens (only admin)
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .unwrap();
        
        if admin != stored_admin {
            panic!("unauthorized");
        }

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut total_supply: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .unwrap();
        total_supply += amount;
        env.storage().persistent().set(
            &symbol_short!("Supply"),
            &total_supply,
        );

        let to_balance = Self::balance(env.clone(), to.clone());
        Self::set_balance(&env, to, to_balance + amount);
    }

    /// Burn tokens (only admin)
    pub fn burn(env: Env, admin: Address, from: Address, amount: i128) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .unwrap();
        
        if admin != stored_admin {
            panic!("unauthorized");
        }

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        Self::set_balance(&env, from, from_balance - amount);

        let mut total_supply: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .unwrap();
        total_supply -= amount;
        env.storage().persistent().set(
            &symbol_short!("Supply"),
            &total_supply,
        );
    }

    /// Approve an allowance for a spender
    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128) {
        owner.require_auth();

        if amount < 0 {
            panic!("amount cannot be negative");
        }

        let key = (symbol_short!("Allow"), owner, spender);
        if amount == 0 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &amount);
        }
    }

    /// Get the allowance for a spender
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env
            .storage()
            .persistent()
            .get(&(symbol_short!("Allow"), owner, spender))
            .unwrap_or(0)
    }

    /// Transfer tokens using allowance
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let current_allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if current_allowance < amount {
            panic!("insufficient allowance");
        }
        Self::set_allowance(&env, from.clone(), spender, current_allowance - amount);

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        Self::set_balance(&env, from, from_balance - amount);
        let to_balance = Self::balance(env.clone(), to.clone());
        Self::set_balance(&env, to, to_balance + amount);
    }

    fn set_balance(env: &Env, account: Address, amount: i128) {
        let key = (symbol_short!("Bal"), account);
        if amount == 0 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &amount);
        }
    }

    fn set_allowance(env: &Env, owner: Address, spender: Address, amount: i128) {
        let key = (symbol_short!("Allow"), owner, spender);
        if amount == 0 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &amount);
        }
    }
}

#[cfg(test)]
mod test;
