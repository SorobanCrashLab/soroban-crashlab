#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Address, Env};

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
    /// `accept_admin` was called while no admin rotation was pending.
    NoPendingAdmin = 8,
}

/// Contract version for upgrade tracking.
///
/// Exposed as a plain associated function rather than an entrypoint so it stays
/// callable from off-chain upgrade tooling without a ledger round trip.
pub const CONTRACT_VERSION: u32 = 1;

// ── Event names ──────────────────────────────────────────────────────────────
//
// `symbol_short!` caps symbols at 9 bytes, so every name below fits. The first
// topic of each event is its name; indexed addresses follow as topics and the
// remaining fields land in the event data. This mirrors the SEP-41 transfer
// shape, which is what wallets and indexers already know how to read.
//
//   transfer  topics: [transfer, from, to]            data: amount
//   mint      topics: [mint, to]                      data: amount
//   burn      topics: [burn, from]                    data: amount
//   approve   topics: [approve, owner, spender]       data: (amount, expiration)
//   init      topics: [init, admin]                   data: total_supply
//   admin_set topics: [admin_set, admin]              data: new_admin
//   admin_acc topics: [admin_acc, new_admin]          data: ()

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Get the contract version. Not an entrypoint — see [`CONTRACT_VERSION`].
    pub fn version() -> u32 {
        CONTRACT_VERSION
    }

    /// Initialize the token with a total supply and assign it to the admin.
    pub fn initialize(env: Env, admin: Address, total_supply: i128) -> Result<(), ContractError> {
        if env.storage().persistent().has(&symbol_short!("Init")) {
            return Err(ContractError::AlreadyInitialized);
        }

        env.storage()
            .persistent()
            .set(&symbol_short!("Admin"), &admin);
        env.storage()
            .persistent()
            .set(&symbol_short!("Supply"), &total_supply);

        Self::set_balance(&env, admin.clone(), total_supply);

        env.storage()
            .persistent()
            .set(&symbol_short!("Init"), &true);

        // Published last, so the event is only observable once the state it
        // describes is committed.
        env.events()
            .publish((symbol_short!("init"), admin), total_supply);

        Ok(())
    }

    /// Get the current admin.
    pub fn admin(env: Env) -> Result<Address, ContractError> {
        env.storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .ok_or(ContractError::NotInitialized)
    }

    /// Get the pending admin, if an accepted rotation is in flight.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().persistent().get(&symbol_short!("PendAdm"))
    }

    /// Nominate a new admin. Two-step so the incoming admin has to accept.
    pub fn set_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), ContractError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("Admin"))
            .ok_or(ContractError::NotInitialized)?;

        if admin != stored_admin {
            return Err(ContractError::Unauthorized);
        }

        env.storage()
            .persistent()
            .set(&symbol_short!("PendAdm"), &new_admin);

        env.events()
            .publish((symbol_short!("admin_set"), admin), new_admin);

        Ok(())
    }

    /// Accept a pending admin nomination, promoting the caller to admin.
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), ContractError> {
        new_admin.require_auth();

        let pending_admin: Option<Address> =
            env.storage().persistent().get(&symbol_short!("PendAdm"));
        let pending_admin = pending_admin.ok_or(ContractError::NoPendingAdmin)?;

        if new_admin != pending_admin {
            return Err(ContractError::Unauthorized);
        }

        env.storage()
            .persistent()
            .set(&symbol_short!("Admin"), &new_admin);
        env.storage().persistent().remove(&symbol_short!("PendAdm"));

        env.events()
            .publish((symbol_short!("admin_acc"), new_admin.clone()), new_admin);

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
        env.storage()
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
        Self::set_balance(&env, from.clone(), new_from_balance);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, to.clone(), new_to_balance);

        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);

        Ok(())
    }

    /// Mint new tokens (only admin).
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) -> Result<(), ContractError> {
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
        Self::set_balance(&env, to.clone(), new_to_balance);

        env.events().publish((symbol_short!("mint"), to), amount);

        Ok(())
    }

    /// Burn tokens from the caller's own balance (holder-authorized).
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), ContractError> {
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
        Self::set_balance(&env, from.clone(), new_from_balance);

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

        env.events().publish((symbol_short!("burn"), from), amount);

        Ok(())
    }

    /// Burn tokens from any holder's balance (admin-authorized).
    pub fn admin_burn(
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
        Self::set_balance(&env, from.clone(), new_from_balance);

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

        // Same `burn` shape as the holder path so indexers only need one handler;
        // the `admin_set`/`admin_acc` topics are not needed to see that an admin
        // forced the burn.
        env.events().publish((symbol_short!("burn"), from), amount);

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

        Self::set_allowance(&env, owner.clone(), spender.clone(), amount);

        // `expiration` is the SEP-41 expiry ledger. This contract's allowances
        // have no TTL, so it is always 0 (meaning "no expiry") and is emitted
        // for shape compatibility with wallet-side decoders.
        env.events()
            .publish((symbol_short!("approve"), owner, spender), (amount, 0u32));

        Ok(())
    }

    /// Get the allowance for a spender.
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
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
        Self::set_balance(&env, from.clone(), new_from_balance);

        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        Self::set_balance(&env, to.clone(), new_to_balance);

        // Deliberately the same `transfer` event as a direct transfer: the
        // spender is already visible in the auth entries, so indexers can
        // attribute an allowance spend without a second event type.
        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);

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
