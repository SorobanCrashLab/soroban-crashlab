#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracterror,
    symbol_short,
    Address, Env,
};

/// Storage layout version. Version 2 stores each balance and allowance in a
/// separate persistent entry. Deployments using version 1 require an explicit
/// migration before calling this contract; no automatic migration is provided.
pub const STORAGE_VERSION: u32 = 2;

/// Typed errors returned by every entrypoint.
///
/// Each variant is assigned a stable integer discriminant so that on-chain
/// clients and the crashlab fuzzer can distinguish failure kinds without
/// inspecting opaque trap messages.
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ContractError {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not the admin.
    Unauthorized = 3,
    /// The transfer / mint / burn amount must be strictly positive;
    /// or the approve amount must be non-negative.
    InvalidAmount = 4,
    /// The sender does not have enough tokens.
    InsufficientBalance = 5,
    /// The spender's allowance is smaller than the requested amount.
    InsufficientAllowance = 6,
    /// An arithmetic operation would overflow.
    Overflow = 7,
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Initialize the token with a total supply and assign it to the admin.
    pub fn initialize(
        env: Env,
        admin: Address,
        total_supply: i128,
    ) -> Result<(), ContractError> {
        if env.storage().persistent().has(&symbol_short!("Init")) {
            return Err(ContractError::AlreadyInitialized);
        }

        env.storage()
            .persistent()
            .set(&symbol_short!("Admin"), &admin);
        env.storage()
            .persistent()
            .set(&symbol_short!("Supply"), &total_supply);

        Self::set_balance(&env, admin, total_supply);

        env.storage()
            .persistent()
            .set(&symbol_short!("Init"), &true);

        Ok(())
    }

    /// Get the total supply of tokens.
    pub fn total_supply(env: Env) -> Result<i128, ContractError> {
        env.storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .ok_or(ContractError::NotInitialized)
    }

    /// Get the balance of an account.
    pub fn balance(env: Env, account: Address) -> i128 {
        env
            .storage()
            .persistent()
            .get(&(symbol_short!("Bal"), account))
            .unwrap_or(0)
    }

    /// Transfer tokens from one account to another.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        from.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, from, new_from_balance);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, to, new_to_balance);

        Ok(())
    }

    /// Mint new tokens (only admin).
    pub fn mint(
        env: Env,
        admin: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .ok_or(ContractError::NotInitialized)?;

        if admin != stored_admin {
            return Err(ContractError::Unauthorized);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let total_supply: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .ok_or(ContractError::NotInitialized)?;
        let new_supply = total_supply
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        env.storage()
            .persistent()
            .set(&symbol_short!("Supply"), &new_supply);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, to, new_to_balance);

        Ok(())
    }

    /// Burn tokens (only admin).
    pub fn burn(
        env: Env,
        admin: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .ok_or(ContractError::NotInitialized)?;

        if admin != stored_admin {
            return Err(ContractError::Unauthorized);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, from, new_from_balance);

        let total_supply: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!("Supply"))
            .ok_or(ContractError::NotInitialized)?;
        let new_supply = total_supply
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        env.storage()
            .persistent()
            .set(&symbol_short!("Supply"), &new_supply);

        Ok(())
    }

    /// Approve an allowance for a spender.
    pub fn approve(
        env: Env,
        owner: Address,
        spender: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        owner.require_auth();

        if amount < 0 {
            return Err(ContractError::InvalidAmount);
        }

        Self::set_allowance(&env, owner, spender, amount);

        Ok(())
    }

    /// Get the allowance for a spender.
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env
            .storage()
            .persistent()
            .get(&(symbol_short!("Allow"), owner, spender))
            .unwrap_or(0)
    }

    /// Transfer tokens using allowance.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        spender.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let current_allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if current_allowance < amount {
            return Err(ContractError::InsufficientAllowance);
        }
        let new_allowance = current_allowance
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_allowance(&env, from.clone(), spender, new_allowance);

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, from, new_from_balance);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, to, new_to_balance);

        Ok(())
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
