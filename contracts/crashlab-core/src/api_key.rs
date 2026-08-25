//! API key management with zero-downtime rotation and grace period transition.
//!
//! Enables seamless key rotation for distributed microservices, CI runners, and
//! CLI clients by allowing a configurable grace window during which both
//! retiring and newly-issued keys authenticate successfully.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

/// Unique identifier for an API key metadata record.
pub type KeyId = String;

/// Permission scopes assigned to an API key.
pub type Scope = String;

/// Lifecycle state of an API key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApiKeyStatus {
    /// Key is primary and fully active.
    Active,
    /// Key is being rotated out; remains valid until `expires_at_ms`.
    GracePeriod { expires_at_ms: u64 },
    /// Key was explicitly revoked and cannot be used.
    Revoked { revoked_at_ms: u64, reason: String },
    /// Key reached its hard expiration time.
    Expired { expired_at_ms: u64 },
}

impl ApiKeyStatus {
    pub fn is_valid_at(&self, current_time_ms: u64) -> bool {
        match self {
            ApiKeyStatus::Active => true,
            ApiKeyStatus::GracePeriod { expires_at_ms } => current_time_ms < *expires_at_ms,
            ApiKeyStatus::Revoked { .. } => false,
            ApiKeyStatus::Expired { .. } => false,
        }
    }
}

/// Metadata and validation details for a stored API key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyRecord {
    pub id: KeyId,
    pub name: String,
    /// Deterministic hash of the raw token. Raw tokens are never stored plaintext.
    pub token_hash: u64,
    pub scopes: HashSet<Scope>,
    pub status: ApiKeyStatus,
    pub created_at_ms: u64,
    pub expires_at_ms: Option<u64>,
    pub last_used_at_ms: Option<u64>,
    pub service_name: String,
}

impl ApiKeyRecord {
    pub fn is_authorized_for(&self, scope: &str, current_time_ms: u64) -> bool {
        if !self.status.is_valid_at(current_time_ms) {
            return false;
        }
        if let Some(hard_expiry) = self.expires_at_ms {
            if current_time_ms >= hard_expiry {
                return false;
            }
        }
        self.scopes.contains("*") || self.scopes.contains(scope)
    }
}

/// Result of an authentication attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthResult {
    /// Authentication succeeded.
    Success {
        key_id: KeyId,
        service_name: String,
        is_grace_period: bool,
    },
    /// Invalid token or key not found.
    InvalidToken,
    /// Key was revoked.
    Revoked { reason: String },
    /// Key or grace period has expired.
    Expired,
    /// Key is valid but lacks required scope.
    InsufficientScope,
}

/// Computes a stable 64-bit hash of an API token string.
pub fn hash_token(raw_token: &str) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;

    let mut hash = FNV_OFFSET;
    for byte in raw_token.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// Thread-safe API key manager with zero-downtime rotation.
#[derive(Debug, Clone)]
pub struct ApiKeyManager {
    keys: Arc<RwLock<HashMap<KeyId, ApiKeyRecord>>>,
    /// Index from token hash to KeyId for O(1) lookup.
    hash_index: Arc<RwLock<HashMap<u64, KeyId>>>,
}

impl Default for ApiKeyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ApiKeyManager {
    pub fn new() -> Self {
        Self {
            keys: Arc::new(RwLock::new(HashMap::new())),
            hash_index: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Creates and registers a new API key. Returns the key ID and raw secret token.
    pub fn create_key(
        &self,
        id: impl Into<KeyId>,
        name: impl Into<String>,
        service_name: impl Into<String>,
        scopes: HashSet<Scope>,
        raw_token: &str,
        created_at_ms: u64,
        expires_at_ms: Option<u64>,
    ) -> Result<KeyId, ApiKeyError> {
        let key_id: KeyId = id.into();
        let token_hash = hash_token(raw_token);

        let mut keys_lock = self.keys.write().unwrap();
        let mut index_lock = self.hash_index.write().unwrap();

        if keys_lock.contains_key(&key_id) {
            return Err(ApiKeyError::KeyAlreadyExists(key_id));
        }
        if index_lock.contains_key(&token_hash) {
            return Err(ApiKeyError::TokenCollision);
        }

        let record = ApiKeyRecord {
            id: key_id.clone(),
            name: name.into(),
            token_hash,
            scopes,
            status: ApiKeyStatus::Active,
            created_at_ms,
            expires_at_ms,
            last_used_at_ms: None,
            service_name: service_name.into(),
        };

        index_lock.insert(token_hash, key_id.clone());
        keys_lock.insert(key_id.clone(), record);

        Ok(key_id)
    }

    /// Authenticates a raw token against the registry.
    pub fn authenticate(
        &self,
        raw_token: &str,
        required_scope: Option<&str>,
        current_time_ms: u64,
    ) -> AuthResult {
        let token_hash = hash_token(raw_token);

        let key_id = {
            let index_lock = self.hash_index.read().unwrap();
            match index_lock.get(&token_hash) {
                Some(id) => id.clone(),
                None => return AuthResult::InvalidToken,
            }
        };

        let mut keys_lock = self.keys.write().unwrap();
        let record = match keys_lock.get_mut(&key_id) {
            Some(r) => r,
            None => return AuthResult::InvalidToken,
        };

        // Check hard expiry
        if let Some(expiry) = record.expires_at_ms {
            if current_time_ms >= expiry {
                record.status = ApiKeyStatus::Expired { expired_at_ms: expiry };
                return AuthResult::Expired;
            }
        }

        let is_grace = match &record.status {
            ApiKeyStatus::Active => false,
            ApiKeyStatus::GracePeriod { expires_at_ms } => {
                if current_time_ms >= *expires_at_ms {
                    return AuthResult::Expired;
                }
                true
            }
            ApiKeyStatus::Revoked { reason, .. } => {
                return AuthResult::Revoked { reason: reason.clone() };
            }
            ApiKeyStatus::Expired { .. } => return AuthResult::Expired,
        };

        // Check scope if required
        if let Some(scope) = required_scope {
            if !record.scopes.contains("*") && !record.scopes.contains(scope) {
                return AuthResult::InsufficientScope;
            }
        }

        record.last_used_at_ms = Some(current_time_ms);

        AuthResult::Success {
            key_id: record.id.clone(),
            service_name: record.service_name.clone(),
            is_grace_period: is_grace,
        }
    }

    /// Initiates zero-downtime rotation of an existing active key.
    ///
    /// The old key transitions to [`ApiKeyStatus::GracePeriod`] expiring in
    /// `grace_duration_ms`. The newly created key is [`ApiKeyStatus::Active`].
    pub fn rotate_key(
        &self,
        old_key_id: &str,
        new_key_id: impl Into<KeyId>,
        new_name: impl Into<String>,
        new_raw_token: &str,
        grace_duration_ms: u64,
        current_time_ms: u64,
    ) -> Result<KeyId, ApiKeyError> {
        let new_id: KeyId = new_key_id.into();
        let new_token_hash = hash_token(new_raw_token);

        let mut keys_lock = self.keys.write().unwrap();
        let mut index_lock = self.hash_index.write().unwrap();

        if keys_lock.contains_key(&new_id) {
            return Err(ApiKeyError::KeyAlreadyExists(new_id));
        }
        if index_lock.contains_key(&new_token_hash) {
            return Err(ApiKeyError::TokenCollision);
        }

        let (service_name, scopes) = {
            let old_record = keys_lock.get_mut(old_key_id)
                .ok_or_else(|| ApiKeyError::KeyNotFound(old_key_id.to_string()))?;

            if !matches!(old_record.status, ApiKeyStatus::Active) {
                return Err(ApiKeyError::InvalidState(format!(
                    "Only Active keys can be rotated. Key '{}' is {:?}",
                    old_key_id, old_record.status
                )));
            }

            old_record.status = ApiKeyStatus::GracePeriod {
                expires_at_ms: current_time_ms + grace_duration_ms,
            };

            (old_record.service_name.clone(), old_record.scopes.clone())
        };

        let new_record = ApiKeyRecord {
            id: new_id.clone(),
            name: new_name.into(),
            token_hash: new_token_hash,
            scopes,
            status: ApiKeyStatus::Active,
            created_at_ms: current_time_ms,
            expires_at_ms: None,
            last_used_at_ms: None,
            service_name,
        };

        index_lock.insert(new_token_hash, new_id.clone());
        keys_lock.insert(new_id.clone(), new_record);

        Ok(new_id)
    }

    /// Immediately revokes a key regardless of whether it was active or in grace period.
    pub fn emergency_revoke(
        &self,
        key_id: &str,
        reason: impl Into<String>,
        revoked_at_ms: u64,
    ) -> Result<(), ApiKeyError> {
        let mut keys_lock = self.keys.write().unwrap();
        let record = keys_lock.get_mut(key_id)
            .ok_or_else(|| ApiKeyError::KeyNotFound(key_id.to_string()))?;

        record.status = ApiKeyStatus::Revoked {
            revoked_at_ms,
            reason: reason.into(),
        };

        Ok(())
    }

    /// Prunes expired and long-revoked keys from the index to bound memory.
    pub fn prune_settled(&self, current_time_ms: u64) -> usize {
        let mut keys_lock = self.keys.write().unwrap();
        let mut index_lock = self.hash_index.write().unwrap();

        let mut to_remove = Vec::new();
        for (id, record) in keys_lock.iter() {
            match &record.status {
                ApiKeyStatus::GracePeriod { expires_at_ms } if current_time_ms >= *expires_at_ms => {
                    to_remove.push(id.clone());
                }
                ApiKeyStatus::Expired { .. } => {
                    to_remove.push(id.clone());
                }
                _ => {}
            }
        }

        let pruned_count = to_remove.len();
        for id in to_remove {
            if let Some(record) = keys_lock.remove(&id) {
                index_lock.remove(&record.token_hash);
            }
        }

        pruned_count
    }

    /// Returns a copy of the key record.
    pub fn get_key(&self, key_id: &str) -> Option<ApiKeyRecord> {
        let lock = self.keys.read().unwrap();
        lock.get(key_id).cloned()
    }

    /// Returns the total number of managed keys.
    pub fn len(&self) -> usize {
        let lock = self.keys.read().unwrap();
        lock.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Errors related to API key lifecycle operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApiKeyError {
    KeyNotFound(KeyId),
    KeyAlreadyExists(KeyId),
    TokenCollision,
    InvalidState(String),
}

impl std::fmt::Display for ApiKeyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiKeyError::KeyNotFound(id) => write!(f, "API key not found: {}", id),
            ApiKeyError::KeyAlreadyExists(id) => write!(f, "API key already exists: {}", id),
            ApiKeyError::TokenCollision => write!(f, "Token collision detected"),
            ApiKeyError::InvalidState(msg) => write!(f, "Invalid key state: {}", msg),
        }
    }
}

impl std::error::Error for ApiKeyError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_scopes() -> HashSet<Scope> {
        let mut s = HashSet::new();
        s.insert("fuzz:write".to_string());
        s.insert("fuzz:read".to_string());
        s
    }

    #[test]
    fn create_and_authenticate_key() {
        let mgr = ApiKeyManager::new();
        mgr.create_key(
            "key-1",
            "CI Runner",
            "ci-service",
            sample_scopes(),
            "secret_token_12345",
            1000,
            None,
        ).unwrap();

        let auth = mgr.authenticate("secret_token_12345", Some("fuzz:read"), 1500);
        assert_eq!(
            auth,
            AuthResult::Success {
                key_id: "key-1".to_string(),
                service_name: "ci-service".to_string(),
                is_grace_period: false,
            }
        );
    }

    #[test]
    fn zero_downtime_rotation_dual_validity() {
        let mgr = ApiKeyManager::new();
        mgr.create_key(
            "key-v1",
            "Prod Ingest",
            "ingest",
            sample_scopes(),
            "old_secret_token",
            1000,
            None,
        ).unwrap();

        // Rotate key-v1 -> key-v2 with 60s grace period (60_000 ms)
        let now = 2000;
        let grace = 60_000;
        mgr.rotate_key("key-v1", "key-v2", "Prod Ingest v2", "new_secret_token", grace, now).unwrap();

        // 1. New key is immediately active
        let auth_new = mgr.authenticate("new_secret_token", None, now + 500);
        assert!(matches!(auth_new, AuthResult::Success { is_grace_period: false, .. }));

        // 2. Old key remains valid during grace period
        let auth_old_during = mgr.authenticate("old_secret_token", None, now + 30_000);
        assert!(matches!(auth_old_during, AuthResult::Success { is_grace_period: true, .. }));

        // 3. Old key expires after grace period
        let auth_old_after = mgr.authenticate("old_secret_token", None, now + grace + 1);
        assert_eq!(auth_old_after, AuthResult::Expired);
    }

    #[test]
    fn emergency_revoke_immediately_invalidates() {
        let mgr = ApiKeyManager::new();
        mgr.create_key(
            "key-leak",
            "Compromised Key",
            "backend",
            sample_scopes(),
            "leaked_token",
            1000,
            None,
        ).unwrap();

        mgr.emergency_revoke("key-leak", "Secret compromised in repo commit", 2000).unwrap();

        let auth = mgr.authenticate("leaked_token", None, 2500);
        assert!(matches!(auth, AuthResult::Revoked { .. }));
    }

    #[test]
    fn scope_enforcement() {
        let mgr = ApiKeyManager::new();
        let mut scopes = HashSet::new();
        scopes.insert("fuzz:read".to_string());

        mgr.create_key("read-only", "RO", "analytics", scopes, "ro_token", 1000, None).unwrap();

        assert!(matches!(
            mgr.authenticate("ro_token", Some("fuzz:read"), 1100),
            AuthResult::Success { .. }
        ));

        assert_eq!(
            mgr.authenticate("ro_token", Some("admin:write"), 1100),
            AuthResult::InsufficientScope
        );
    }

    #[test]
    fn prune_settled_removes_expired_grace_keys() {
        let mgr = ApiKeyManager::new();
        mgr.create_key("k1", "A", "svc", sample_scopes(), "tok1", 1000, None).unwrap();
        mgr.rotate_key("k1", "k2", "B", "tok2", 5000, 2000).unwrap();

        assert_eq!(mgr.len(), 2);

        // Prune after grace period has expired (at 8000ms)
        let pruned = mgr.prune_settled(8000);
        assert_eq!(pruned, 1);
        assert_eq!(mgr.len(), 1);
        assert!(mgr.get_key("k1").is_none());
        assert!(mgr.get_key("k2").is_some());
    }

    #[test]
    fn duplicate_key_or_token_rejected() {
        let mgr = ApiKeyManager::new();
        mgr.create_key("k1", "A", "svc", sample_scopes(), "unique_tok_1", 1000, None).unwrap();

        assert!(matches!(
            mgr.create_key("k1", "A", "svc", sample_scopes(), "other_tok", 1000, None),
            Err(ApiKeyError::KeyAlreadyExists(_))
        ));

        assert!(matches!(
            mgr.create_key("k2", "B", "svc", sample_scopes(), "unique_tok_1", 1000, None),
            Err(ApiKeyError::TokenCollision)
        ));
    }
}
