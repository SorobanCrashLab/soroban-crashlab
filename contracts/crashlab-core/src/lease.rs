//! Distributed lease coordination for multi-instance safety.
//!
//! This module provides KV-backed distributed leases with fencing tokens to
//! prevent concurrent execution of critical operations (retention sweeps,
//! stale detection, checkpoint compaction).
//!
//! ## Design
//!
//! - Leases are acquired atomically via compare-and-swap operations
//! - Each lease carries a fencing token (UUID) for write validation
//! - State writes must carry the token as a precondition
//! - Expired leases can be replaced; valid leases block new acquisitions
//!
//! ## Usage
//!
//! ```rust
//! use crashlab_core::lease::{LeaseKey, with_lease};
//!
//! with_lease(LeaseKey::Sweep, 30_000, |token| {
//!     // Perform sweep with fencing token
//!     Ok(())
//! })?;
//! ```

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// Lease keys identifying protected resources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LeaseKey {
    /// Retention sweep operation.
    Sweep,
    /// Stale detection scan.
    StaleDetection,
    /// Checkpoint compaction.
    Compaction,
    /// Cancel fan-out for a specific run.
    Cancel(u64),
    /// Scheduled cron job execution.
    Cron(&'static str),
}

impl LeaseKey {
    pub fn as_str(&self) -> String {
        match self {
            LeaseKey::Sweep => "sweep".to_string(),
            LeaseKey::StaleDetection => "stale-detection".to_string(),
            LeaseKey::Compaction => "compaction".to_string(),
            LeaseKey::Cancel(run_id) => format!("cancel:{}", run_id),
            LeaseKey::Cron(job_name) => format!("cron:{}", job_name),
        }
    }
}

/// Lease acquisition result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lease {
    /// Lease key identifying the resource.
    pub key: LeaseKey,
    /// Fencing token for write validation.
    pub token: String,
    /// Absolute expiry timestamp (milliseconds since epoch).
    pub expires_at: u64,
}

/// Lease acquisition failure reasons.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LeaseError {
    /// Another instance holds the lease.
    HeldByAnother,
    /// Storage backend unavailable.
    StorageUnavailable(String),
}

impl std::fmt::Display for LeaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LeaseError::HeldByAnother => write!(f, "lease held by another instance"),
            LeaseError::StorageUnavailable(msg) => write!(f, "storage unavailable: {}", msg),
        }
    }
}

impl std::error::Error for LeaseError {}

/// In-memory lease storage for testing and single-instance deployments.
///
/// In production with multi-instance deployment, this would be backed by
/// a distributed KV store (Redis, etcd, etc.) with atomic compare-and-swap.
pub struct InMemoryLeaseStore {
    leases: std::sync::Mutex<std::collections::HashMap<String, (String, u64)>>,
}

impl InMemoryLeaseStore {
    pub fn new() -> Self {
        Self {
            leases: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// Attempts to acquire a lease atomically.
    pub fn acquire(&self, key: LeaseKey, ttl_ms: u64) -> Result<Lease, LeaseError> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let expires_at = now_ms + ttl_ms;
        let token = Uuid::new_v4().to_string();
        let key_str = key.as_str();

        let mut leases = self.leases.lock().unwrap();

        // Check if lease exists and is not expired
        if let Some((_, existing_expires)) = leases.get(&key_str) {
            if *existing_expires > now_ms {
                return Err(LeaseError::HeldByAnother);
            }
        }

        // Acquire or replace expired lease
        leases.insert(key_str, (token.clone(), expires_at));

        Ok(Lease {
            key,
            token,
            expires_at,
        })
    }

    /// Validates that a fencing token matches the current lease holder.
    pub fn validate_token(&self, key: LeaseKey, token: &str) -> bool {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let key_str = key.as_str();

        let leases = self.leases.lock().unwrap();

        if let Some((stored_token, expires_at)) = leases.get(&key_str) {
            stored_token == token && *expires_at > now_ms
        } else {
            false
        }
    }

    /// Releases a lease if the token matches.
    pub fn release(&self, lease: &Lease) -> bool {
        let key_str = lease.key.as_str();
        let mut leases = self.leases.lock().unwrap();

        if let Some((stored_token, _)) = leases.get(&key_str) {
            if stored_token == &lease.token {
                leases.remove(&key_str);
                return true;
            }
        }

        false
    }
}

impl Default for InMemoryLeaseStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Global in-memory lease store for testing and single-instance deployments.
static LEASE_STORE: std::sync::OnceLock<InMemoryLeaseStore> = std::sync::OnceLock::new();

fn get_lease_store() -> &'static InMemoryLeaseStore {
    LEASE_STORE.get_or_init(InMemoryLeaseStore::new)
}

/// Attempts to acquire a distributed lease for the specified key.
///
/// Returns a [`Lease`] if acquired, or [`LeaseError`] if another holder has
/// the lease or storage is unavailable.
pub fn acquire(key: LeaseKey, ttl_ms: u64) -> Result<Lease, LeaseError> {
    get_lease_store().acquire(key, ttl_ms)
}

/// Validates that a fencing token matches the current lease holder.
///
/// Used by state write operations to reject stale writes from instances
/// whose lease has expired or been replaced.
pub fn validate_token(key: LeaseKey, token: &str) -> bool {
    get_lease_store().validate_token(key, token)
}

/// Releases a lease, allowing other instances to acquire it.
pub fn release(lease: &Lease) -> bool {
    get_lease_store().release(lease)
}

/// Convenience wrapper: acquires a lease, runs a function, and releases.
///
/// The function receives the fencing token and should attach it to all
/// state writes as a precondition.
pub fn with_lease<F, T, E>(key: LeaseKey, ttl_ms: u64, f: F) -> Result<T, E>
where
    F: FnOnce(&str) -> Result<T, E>,
    E: From<LeaseError>,
{
    let lease = acquire(key, ttl_ms)?;

    let result = f(&lease.token);

    // Best-effort release; failures are silent
    let _ = release(&lease);

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acquire_returns_lease_when_no_lease_exists() {
        let store = InMemoryLeaseStore::new();
        let result = store.acquire(LeaseKey::Sweep, 30_000);

        assert!(result.is_ok());
        let lease = result.unwrap();
        assert_eq!(lease.key, LeaseKey::Sweep);
        assert!(!lease.token.is_empty());
        assert!(lease.expires_at > 0);
    }

    #[test]
    fn acquire_returns_err_when_valid_lease_exists() {
        let store = InMemoryLeaseStore::new();
        let _lease1 = store.acquire(LeaseKey::Sweep, 30_000).unwrap();

        let result = store.acquire(LeaseKey::Sweep, 30_000);

        assert!(matches!(result, Err(LeaseError::HeldByAnother)));
    }

    #[test]
    fn acquire_replaces_expired_lease() {
        let store = InMemoryLeaseStore::new();
        let _lease1 = store.acquire(LeaseKey::Sweep, 1).unwrap();

        // Wait for expiry
        std::thread::sleep(Duration::from_millis(10));

        let result = store.acquire(LeaseKey::Sweep, 30_000);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_token_returns_true_for_valid_token() {
        let store = InMemoryLeaseStore::new();
        let lease = store.acquire(LeaseKey::Sweep, 30_000).unwrap();

        let valid = store.validate_token(LeaseKey::Sweep, &lease.token);

        assert!(valid);
    }

    #[test]
    fn validate_token_returns_false_for_invalid_token() {
        let store = InMemoryLeaseStore::new();
        let _lease = store.acquire(LeaseKey::Sweep, 30_000).unwrap();

        let valid = store.validate_token(LeaseKey::Sweep, "wrong-token");

        assert!(!valid);
    }

    #[test]
    fn validate_token_returns_false_for_expired_lease() {
        let store = InMemoryLeaseStore::new();
        let lease = store.acquire(LeaseKey::Sweep, 1).unwrap();

        std::thread::sleep(Duration::from_millis(10));

        let valid = store.validate_token(LeaseKey::Sweep, &lease.token);

        assert!(!valid);
    }

    #[test]
    fn release_returns_true_when_token_matches() {
        let store = InMemoryLeaseStore::new();
        let lease = store.acquire(LeaseKey::Sweep, 30_000).unwrap();

        let released = store.release(&lease);

        assert!(released);

        // Should be able to acquire again
        let result = store.acquire(LeaseKey::Sweep, 30_000);
        assert!(result.is_ok());
    }

    #[test]
    fn release_returns_false_when_token_does_not_match() {
        let store = InMemoryLeaseStore::new();
        let lease = store.acquire(LeaseKey::Sweep, 30_000).unwrap();

        let wrong_lease = Lease {
            key: LeaseKey::Sweep,
            token: "wrong-token".to_string(),
            expires_at: lease.expires_at,
        };

        let released = store.release(&wrong_lease);

        assert!(!released);
    }

    #[test]
    fn with_lease_acquires_runs_and_releases() {
        let mut executed = false;

        let result = with_lease(LeaseKey::Sweep, 30_000, |token| {
            assert!(!token.is_empty());
            executed = true;
            Ok::<(), LeaseError>(())
        });

        assert!(result.is_ok());
        assert!(executed);

        // Should be able to acquire again (was released)
        let store = get_lease_store();
        let result = store.acquire(LeaseKey::Sweep, 30_000);
        assert!(result.is_ok());
    }

    #[test]
    fn with_lease_returns_err_when_lease_not_acquired() {
        let store = get_lease_store();
        let _lease = store.acquire(LeaseKey::StaleDetection, 30_000).unwrap();

        let result = with_lease(LeaseKey::StaleDetection, 30_000, |_token| {
            Ok::<(), LeaseError>(())
        });

        assert!(matches!(result, Err(LeaseError::HeldByAnother)));
    }

    #[test]
    fn contention_test_one_wins() {
        let store = InMemoryLeaseStore::new();

        let lease1 = store.acquire(LeaseKey::Compaction, 30_000);
        let lease2 = store.acquire(LeaseKey::Compaction, 30_000);

        // Exactly one should succeed
        assert!(lease1.is_ok() != lease2.is_ok());
    }

    #[test]
    fn different_keys_do_not_conflict() {
        let store = InMemoryLeaseStore::new();

        let lease1 = store.acquire(LeaseKey::Sweep, 30_000);
        let lease2 = store.acquire(LeaseKey::Compaction, 30_000);

        assert!(lease1.is_ok());
        assert!(lease2.is_ok());
    }

    #[test]
    fn cancel_leases_are_per_run() {
        let store = InMemoryLeaseStore::new();

        let lease1 = store.acquire(LeaseKey::Cancel(1), 30_000);
        let lease2 = store.acquire(LeaseKey::Cancel(2), 30_000);

        assert!(lease1.is_ok());
        assert!(lease2.is_ok());
    }
}
