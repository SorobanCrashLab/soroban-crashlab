#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracterror,
    map, symbol_short,
    Address, Env, Map,
};

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
    /// The spender's allowance lapsed before this call. The grant was removed
    /// and the spender must be approved again.
    AllowanceExpired = 8,
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

        let mut balances: Map<Address, i128> = map![&env];
        balances.set(admin.clone(), total_supply);
        env.storage()
            .persistent()
            .set(&symbol_short!("Bal"), &balances);

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
    pub fn balance(env: Env, account: Address) -> Result<i128, ContractError> {
        let balances: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Bal"))
            .ok_or(ContractError::NotInitialized)?;
        Ok(balances.get(account).unwrap_or(0))
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

        let mut balances: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Bal"))
            .ok_or(ContractError::NotInitialized)?;

        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }

        balances.set(
            from.clone(),
            from_balance
                .checked_sub(amount)
                .ok_or(ContractError::Overflow)?,
        );
        let to_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(
            to,
            to_balance
                .checked_add(amount)
                .ok_or(ContractError::Overflow)?,
        );

        env.storage()
            .persistent()
            .set(&symbol_short!("Bal"), &balances);
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

        let mut balances: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Bal"))
            .ok_or(ContractError::NotInitialized)?;
        let to_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(
            to,
            to_balance
                .checked_add(amount)
                .ok_or(ContractError::Overflow)?,
        );
        env.storage()
            .persistent()
            .set(&symbol_short!("Bal"), &balances);
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

        let mut balances: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Bal"))
            .ok_or(ContractError::NotInitialized)?;
        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }
        balances.set(
            from,
            from_balance
                .checked_sub(amount)
                .ok_or(ContractError::Overflow)?,
        );
        env.storage()
            .persistent()
            .set(&symbol_short!("Bal"), &balances);

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
    ///
    /// `expiration_ledger` is the last ledger sequence at which the grant can be
    /// spent; from the next ledger it lapses and [`TokenContract::allowance`]
    /// reports `0`. An `amount` of `0` revokes any existing grant and deletes its
    /// storage entry, matching the Stellar asset contract's `approve`.
    pub fn approve(
        env: Env,
        owner: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) -> Result<(), ContractError> {
        owner.require_auth();

        if amount < 0 {
            return Err(ContractError::InvalidAmount);
        }

        let key = (owner.clone(), spender);
        if amount == 0 {
            Self::clear_grant(&env, key);
        } else {
            Self::set_grant(&env, key, amount, expiration_ledger);
        }
        Ok(())
    }

    /// Get the allowance for a spender.
    ///
    /// A lapsed grant reads as `0` and is deleted the first time it is observed, so
    /// a forgotten approval stops being spendable and stops occupying storage.
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        let key = (owner, spender);
        match Self::expirations(&env).get(key.clone()) {
            Some(expiration_ledger) if env.ledger().sequence() <= expiration_ledger => {
                Self::allowances(&env).get(key).unwrap_or(0)
            }
            Some(_) => {
                Self::clear_grant(&env, key);
                0
            }
            // Never granted, or granted by a build that stored no expiration.
            None => 0,
        }
    }

    /// Transfer tokens using allowance.
    ///
    /// Returns [`ContractError::AllowanceExpired`] when the grant lapsed before this
    /// call; the spender must be approved again. A grant that is merely too small
    /// returns [`ContractError::InsufficientAllowance`].
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

        let key = (from.clone(), spender);
        let expiration_ledger = match Self::expirations(&env).get(key.clone()) {
            Some(expiration_ledger) if env.ledger().sequence() <= expiration_ledger => {
                expiration_ledger
            }
            Some(_) => {
                Self::clear_grant(&env, key);
                return Err(ContractError::AllowanceExpired);
            }
            None => return Err(ContractError::InsufficientAllowance),
        };

        let current_allowance = Self::allowances(&env).get(key.clone()).unwrap_or(0);
        if current_allowance < amount {
            return Err(ContractError::InsufficientAllowance);
        }

        let remaining = current_allowance
            .checked_sub(amount)
            .ok_or(ContractError::Overflow)?;
        if remaining == 0 {
            // A fully spent grant is deleted rather than left behind as a zero.
            Self::clear_grant(&env, key);
        } else {
            Self::set_grant(&env, key, remaining, expiration_ledger);
        }

        let mut balances: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&symbol_short!("Bal"))
            .ok_or(ContractError::NotInitialized)?;
        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            return Err(ContractError::InsufficientBalance);
        }
        balances.set(
            from.clone(),
            from_balance
                .checked_sub(amount)
                .ok_or(ContractError::Overflow)?,
        );
        let to_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(
            to,
            to_balance
                .checked_add(amount)
                .ok_or(ContractError::Overflow)?,
        );
        env.storage()
            .persistent()
            .set(&symbol_short!("Bal"), &balances);
        Ok(())
    }

    /// Allowance amounts, keyed by `(owner, spender)`.
    fn allowances(env: &Env) -> Map<(Address, Address), i128> {
        env.storage()
            .persistent()
            .get(&symbol_short!("Allow"))
            .unwrap_or(map![env])
    }

    /// Last ledger sequence each grant is usable, keyed the same way.
    ///
    /// A grant with no entry here was written by a build without expirations. It
    /// cannot say when it lapses, so it is treated as lapsed instead of being read
    /// as permanent.
    fn expirations(env: &Env) -> Map<(Address, Address), u32> {
        env.storage()
            .persistent()
            .get(&symbol_short!("Exp"))
            .unwrap_or(map![env])
    }

    fn set_grant(env: &Env, key: (Address, Address), amount: i128, expiration_ledger: u32) {
        let mut allowances = Self::allowances(env);
        let mut expirations = Self::expirations(env);
        allowances.set(key.clone(), amount);
        expirations.set(key, expiration_ledger);
        Self::store(env, &allowances, &expirations);
    }

    fn clear_grant(env: &Env, key: (Address, Address)) {
        let mut allowances = Self::allowances(env);
        let mut expirations = Self::expirations(env);
        allowances.remove(key.clone());
        expirations.remove(key);
        Self::store(env, &allowances, &expirations);
    }

    fn store(
        env: &Env,
        allowances: &Map<(Address, Address), i128>,
        expirations: &Map<(Address, Address), u32>,
    ) {
        env.storage()
            .persistent()
            .set(&symbol_short!("Allow"), allowances);
        env.storage()
            .persistent()
            .set(&symbol_short!("Exp"), expirations);
    }
}

#[cfg(test)]
mod test;
