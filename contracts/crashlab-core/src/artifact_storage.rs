//! Storage backend integration for persisting and retrieving crash artifacts.
//!
//! This module provides a pluggable storage abstraction that supports multiple
//! backends (local filesystem, cloud storage, etc.) for artifact persistence,
//! retrieval, and listing operations. All operations preserve artifact integrity
//! through content-addressed storage and deterministic versioning.
//!
//! # Behavioral contract (#1830)
//!
//! Every [`ArtifactStore`] implementation must satisfy the same behavioral
//! contract — TTL expiry precision, atomicity, error taxonomy, streaming read
//! equivalence and concurrent access safety. The contract is executable:
//! [`tests/storage_conformance.rs`](../../tests/storage_conformance.rs) runs one
//! shared suite against every backend compiled into the build. A backend that
//! fails a conformance assertion is a bug to be fixed (or explicitly waived by
//! opening an issue), never a reason to weaken the suite.

use crate::{BundlePersistError, CaseBundle};
use std::fs;
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};

/// How long past its deadline an artifact may still be readable before the
/// conformance suite counts the TTL as missed.
///
/// Contract (#1830, TTL expiry precision): expiry is never honoured *early*,
/// and is honoured by `ttl + this slack`. Backends whose TTL granularity is
/// coarser than one second declare their own resolution to the suite; the
/// slack covers scheduling jitter, not rounding.
pub const TTL_EXPIRY_SLACK_SECONDS: u64 = 5;

/// Maximum size of an uncompressed artifact JSON document.
pub const MAX_ARTIFACT_JSON_BYTES: usize = crate::bundle_persist::MAX_BUNDLE_JSON_BYTES;

/// Configuration for artifact storage backends.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StorageConfig {
    /// Store artifacts in the local filesystem at the specified directory.
    Local { base_path: PathBuf },
}

impl StorageConfig {
    /// Creates a local filesystem storage configuration.
    pub fn local(base_path: impl AsRef<Path>) -> Self {
        Self::Local {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    /// Returns the storage directory path.
    pub fn base_path(&self) -> &Path {
        match self {
            Self::Local { base_path } => base_path,
        }
    }
}

impl Default for StorageConfig {
    fn default() -> Self {
        StorageConfig::local(".crashlab/artifacts")
    }
}

/// Contract-level error classes shared by every backend (#1830).
///
/// The conformance suite asserts that all backends classify the same failure
/// the same way, so callers (and the failover path) can react identically no
/// matter which backend is configured.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageErrorKind {
    /// Nothing is stored under that id: never written, deleted, or expired.
    NotFound,
    /// The id itself is unacceptable (empty, path traversal).
    InvalidId,
    /// Bytes were found but cannot be interpreted: truncated, tampered with,
    /// or not a valid bundle document.
    Corrupt,
    /// The backend refused the operation on credential or permission grounds.
    PermissionDenied,
    /// Retryable failure: dropped connection, full disk, backend unavailable.
    Transient,
    /// The backend cannot honour the requested feature at all (e.g. TTL).
    Unsupported,
}

/// Errors from artifact storage operations.
#[derive(Debug)]
pub enum StorageError {
    /// I/O error during storage operation.
    Io(io::Error),
    /// Error serializing/deserializing artifact.
    Persistence(BundlePersistError),
    /// Artifact not found at specified path.
    NotFound { artifact_id: String },
    /// Invalid artifact ID or path traversal attempt.
    InvalidId { artifact_id: String },
    /// Stored bytes exist but failed integrity or parse checks.
    Corrupt { artifact_id: String, detail: String },
    /// The backend refused the operation (credentials, ACL, bucket policy).
    PermissionDenied { artifact_id: String },
    /// A TTL was requested from a backend that has no TTL support.
    TtlUnsupported { artifact_id: String },
}

impl StorageError {
    /// Maps every variant onto the shared contract taxonomy.
    ///
    /// A persistence failure is classified as [`StorageErrorKind::Corrupt`]:
    /// bytes that do not parse as a bundle document are corrupt payload, not a
    /// transport problem, and must not be retried blindly.
    pub fn kind(&self) -> StorageErrorKind {
        match self {
            StorageError::NotFound { .. } => StorageErrorKind::NotFound,
            StorageError::InvalidId { .. } => StorageErrorKind::InvalidId,
            StorageError::Corrupt { .. } | StorageError::Persistence(_) => {
                StorageErrorKind::Corrupt
            }
            StorageError::PermissionDenied { .. } => StorageErrorKind::PermissionDenied,
            StorageError::Io(_) => StorageErrorKind::Transient,
            StorageError::TtlUnsupported { .. } => StorageErrorKind::Unsupported,
        }
    }

    /// The artifact id the failure refers to, when the error carries one.
    pub fn artifact_id(&self) -> Option<&str> {
        match self {
            StorageError::NotFound { artifact_id }
            | StorageError::InvalidId { artifact_id }
            | StorageError::Corrupt { artifact_id, .. }
            | StorageError::PermissionDenied { artifact_id }
            | StorageError::TtlUnsupported { artifact_id } => Some(artifact_id),
            StorageError::Io(_) | StorageError::Persistence(_) => None,
        }
    }
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::Io(e) => write!(f, "storage I/O error: {e}"),
            StorageError::Persistence(e) => write!(f, "artifact persistence error: {e}"),
            StorageError::NotFound { artifact_id } => {
                write!(f, "artifact not found: {artifact_id}")
            }
            StorageError::InvalidId { artifact_id } => {
                write!(f, "invalid artifact ID: {artifact_id}")
            }
            StorageError::Corrupt {
                artifact_id,
                detail,
            } => {
                write!(f, "corrupt artifact {artifact_id}: {detail}")
            }
            StorageError::PermissionDenied { artifact_id } => {
                write!(f, "permission denied for artifact: {artifact_id}")
            }
            StorageError::TtlUnsupported { artifact_id } => {
                write!(
                    f,
                    "backend does not support TTL for artifact: {artifact_id}"
                )
            }
        }
    }
}

impl std::error::Error for StorageError {}

impl From<io::Error> for StorageError {
    fn from(e: io::Error) -> Self {
        StorageError::Io(e)
    }
}

impl From<BundlePersistError> for StorageError {
    fn from(e: BundlePersistError) -> Self {
        StorageError::Persistence(e)
    }
}

/// Metadata about a stored artifact without the full bundle contents.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactMetadata {
    /// Unique artifact identifier (content hash or assigned ID).
    pub id: String,
    /// Artifact filename or display name.
    pub name: String,
    /// Size in bytes of the persisted artifact.
    pub size_bytes: u64,
    /// Creation timestamp (ISO 8601 format).
    pub created_at: String,
}

/// Artifact storage backend trait for pluggable implementations.
pub trait ArtifactStore: Send + Sync {
    /// Persists an artifact to storage with the given ID.
    ///
    /// Returns metadata about the stored artifact.
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError>;

    /// Retrieves a stored artifact by ID.
    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError>;

    /// Retrieves only metadata for an artifact (without contents).
    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError>;

    /// Lists all stored artifacts in the backend.
    fn list_artifacts(&self) -> Result<Vec<ArtifactMetadata>, StorageError>;

    /// Deletes an artifact from storage.
    ///
    /// Contract: idempotent. Deleting a missing id succeeds.
    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError>;

    /// Checks if an artifact exists in storage.
    ///
    /// Contract: an expired artifact does not exist.
    fn artifact_exists(&self, artifact_id: &str) -> bool;

    /// Persists an artifact that must stop being readable after `ttl_secs`.
    ///
    /// Contract (#1830, TTL expiry precision):
    /// - the artifact is readable for at least `ttl_secs` (never expires early);
    /// - once `ttl_secs` has elapsed it reads as [`StorageError::NotFound`];
    /// - the expiry is honoured within [`TTL_EXPIRY_SLACK_SECONDS`].
    ///
    /// Backends without TTL support must answer
    /// [`StorageError::TtlUnsupported`] rather than silently storing the
    /// artifact forever.
    fn store_artifact_with_ttl(
        &self,
        _artifact_id: &str,
        _bundle: &CaseBundle,
        _ttl_secs: u64,
    ) -> Result<ArtifactMetadata, StorageError> {
        Err(StorageError::TtlUnsupported {
            artifact_id: _artifact_id.to_string(),
        })
    }

    /// Seconds until the artifact expires, or `None` when it has no TTL (or
    /// already expired — expiry reads as absence everywhere else too).
    fn artifact_ttl_remaining(&self, _artifact_id: &str) -> Option<u64> {
        None
    }

    /// The exact bytes `store_artifact` persisted, without parsing them.
    ///
    /// This is the whole-read side of the streaming-read-equivalence contract:
    /// [`ArtifactStore::open_artifact_reader`] must yield these same bytes in
    /// the same order.
    fn retrieve_artifact_bytes(&self, artifact_id: &str) -> Result<Vec<u8>, StorageError> {
        let bundle = self.retrieve_artifact(artifact_id)?;
        crate::save_case_bundle_json(&bundle).map_err(|e| StorageError::Corrupt {
            artifact_id: artifact_id.to_string(),
            detail: e.to_string(),
        })
    }

    /// Streaming read path over the stored bytes.
    ///
    /// Contract: consuming the reader yields exactly
    /// [`ArtifactStore::retrieve_artifact_bytes`] — no short reads, no
    /// reordering, no trailing garbage. The default implementation satisfies
    /// that by construction; backends that override it (for example a file or
    /// socket-backed reader) must preserve the equivalence.
    fn open_artifact_reader(
        &self,
        artifact_id: &str,
    ) -> Result<Box<dyn io::Read + Send>, StorageError> {
        Ok(Box::new(Cursor::new(
            self.retrieve_artifact_bytes(artifact_id)?,
        )))
    }

    /// Returns the artifact class for retention policy purposes.
    ///
    /// Defaults to `ArtifactClass::RawSeed` for backends that do not track classes.
    fn artifact_class(&self, _artifact_id: &str) -> crate::retention::ArtifactClass {
        crate::retention::ArtifactClass::RawSeed
    }

    /// Returns the last-modified timestamp (epoch seconds) for an artifact.
    ///
    /// Used by lease-based retention sweeps to compute artifact age.
    fn artifact_modified_epoch(&self, _artifact_id: &str) -> Option<i64> {
        None
    }
}

/// Validates artifact IDs for every backend (#1830 error taxonomy).
///
/// All backends must reject exactly the same ids so a failover never turns a
/// rejected id into a stored one.
fn validate_artifact_id(id: &str) -> Result<(), StorageError> {
    if id.is_empty() || id == ".." || id.contains('/') || id.contains('\\') {
        return Err(StorageError::InvalidId {
            artifact_id: id.to_string(),
        });
    }
    Ok(())
}

/// Local filesystem-based artifact storage.
pub struct LocalArtifactStore {
    base_path: PathBuf,
}

impl LocalArtifactStore {
    /// Creates a new local artifact store at the specified path.
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self, io::Error> {
        let base_path = base_path.as_ref().to_path_buf();
        fs::create_dir_all(&base_path)?;
        Ok(Self { base_path })
    }

    /// Validates artifact ID to prevent directory traversal attacks.
    fn validate_artifact_id(id: &str) -> Result<(), StorageError> {
        validate_artifact_id(id)
    }

    /// Constructs the filesystem path for an artifact.
    fn artifact_path(&self, artifact_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.json", artifact_id))
    }

    /// Sidecar holding the absolute expiry epoch (seconds) written by
    /// [`ArtifactStore::store_artifact_with_ttl`]. Not a `.json` file, so it is
    /// invisible to listing and to the artifact-id namespace.
    fn ttl_path(&self, artifact_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.ttl", artifact_id))
    }

    /// Writes via a temporary sibling and renames, so a crash mid-write can
    /// never leave a half-written artifact at the final path (#1830 atomicity).
    fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
        let mut tmp_name = path.as_os_str().to_os_string();
        tmp_name.push(".tmp");
        let tmp_path = PathBuf::from(tmp_name);
        fs::write(&tmp_path, bytes)?;
        fs::rename(&tmp_path, path)
    }

    fn now_epoch_secs() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Reads the sidecar expiry, treating an unreadable sidecar as "no TTL"
    /// (a torn sidecar must not make a healthy artifact unreadable).
    fn ttl_expiry_epoch(&self, artifact_id: &str) -> Option<u64> {
        let contents = fs::read_to_string(self.ttl_path(artifact_id)).ok()?;
        contents.trim().parse::<u64>().ok()
    }

    /// True when the artifact exists but its TTL has passed; a true result
    /// also purges the expired pair so the id is free for reuse.
    fn purge_if_expired(&self, artifact_id: &str) -> bool {
        let Some(expiry) = self.ttl_expiry_epoch(artifact_id) else {
            return false;
        };
        if Self::now_epoch_secs() < expiry {
            return false;
        }
        let _ = fs::remove_file(self.artifact_path(artifact_id));
        let _ = fs::remove_file(self.ttl_path(artifact_id));
        true
    }

    /// Extracts metadata from an artifact ID and file metadata.
    fn metadata_from_file(
        artifact_id: &str,
        path: &Path,
    ) -> Result<ArtifactMetadata, StorageError> {
        let metadata = fs::metadata(path)?;
        let modified = metadata.modified()?;
        let duration = modified
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let created_at = chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + duration)
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        Ok(ArtifactMetadata {
            id: artifact_id.to_string(),
            name: format!("{}.json", artifact_id),
            size_bytes: metadata.len(),
            created_at,
        })
    }

    /// Shared read guard: validate the id, drop expired pairs, then require
    /// the artifact file to be present.
    fn ensure_readable(&self, artifact_id: &str) -> Result<PathBuf, StorageError> {
        Self::validate_artifact_id(artifact_id)?;
        if self.purge_if_expired(artifact_id) {
            return Err(StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            });
        }
        let path = self.artifact_path(artifact_id);
        if !path.exists() {
            return Err(StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            });
        }
        Ok(path)
    }
}

impl ArtifactStore for LocalArtifactStore {
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError> {
        Self::validate_artifact_id(artifact_id)?;

        let path = self.artifact_path(artifact_id);
        let json_bytes = crate::save_sanitized_case_bundle_json(bundle)?;
        if json_bytes.len() > MAX_ARTIFACT_JSON_BYTES {
            return Err(StorageError::Persistence(BundlePersistError::SizeLimit {
                limit: MAX_ARTIFACT_JSON_BYTES,
            }));
        }
        Self::write_atomic(&path, &json_bytes)?;

        Self::metadata_from_file(artifact_id, &path)
    }

    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError> {
        let bytes = self.retrieve_artifact_bytes(artifact_id)?;
        if bytes.len() > MAX_ARTIFACT_JSON_BYTES {
            return Err(StorageError::Persistence(BundlePersistError::SizeLimit {
                limit: MAX_ARTIFACT_JSON_BYTES,
            }));
        }
        crate::load_case_bundle_json(&bytes).map_err(|e| StorageError::Corrupt {
            artifact_id: artifact_id.to_string(),
            detail: e.to_string(),
        })
    }

    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError> {
        let path = self.ensure_readable(artifact_id)?;
        Self::metadata_from_file(artifact_id, &path)
    }

    fn list_artifacts(&self) -> Result<Vec<ArtifactMetadata>, StorageError> {
        let entries = fs::read_dir(&self.base_path)?;
        let mut artifacts = Vec::new();

        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map_or(false, |ext| ext == "json") {
                if let Some(file_stem) = path.file_stem() {
                    if let Some(artifact_id) = file_stem.to_str() {
                        // Expired artifacts are not listed; the sweep below
                        // also purges them so the listing is not just a view.
                        if self.purge_if_expired(artifact_id) {
                            continue;
                        }
                        if let Ok(metadata) = Self::metadata_from_file(artifact_id, &path) {
                            artifacts.push(metadata);
                        }
                    }
                }
            }
        }

        // Sort by creation date, newest first
        artifacts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(artifacts)
    }

    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError> {
        Self::validate_artifact_id(artifact_id)?;

        let path = self.artifact_path(artifact_id);
        if path.exists() {
            fs::remove_file(&path)?;
        }
        // A leftover sidecar from a TTL write must not resurrect metadata.
        let ttl_path = self.ttl_path(artifact_id);
        if ttl_path.exists() {
            fs::remove_file(&ttl_path)?;
        }
        Ok(())
    }

    fn artifact_exists(&self, artifact_id: &str) -> bool {
        Self::validate_artifact_id(artifact_id).is_ok()
            && !self.purge_if_expired(artifact_id)
            && self.artifact_path(artifact_id).exists()
    }

    fn store_artifact_with_ttl(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
        ttl_secs: u64,
    ) -> Result<ArtifactMetadata, StorageError> {
        let metadata = self.store_artifact(artifact_id, bundle)?;
        let expiry = Self::now_epoch_secs().saturating_add(ttl_secs);
        Self::write_atomic(&self.ttl_path(artifact_id), expiry.to_string().as_bytes())?;
        Ok(metadata)
    }

    fn artifact_ttl_remaining(&self, artifact_id: &str) -> Option<u64> {
        if Self::validate_artifact_id(artifact_id).is_err() {
            return None;
        }
        let expiry = self.ttl_expiry_epoch(artifact_id)?;
        Some(expiry.saturating_sub(Self::now_epoch_secs()))
    }

    fn retrieve_artifact_bytes(&self, artifact_id: &str) -> Result<Vec<u8>, StorageError> {
        let path = self.ensure_readable(artifact_id)?;
        Ok(fs::read(path)?)
    }

    fn open_artifact_reader(
        &self,
        artifact_id: &str,
    ) -> Result<Box<dyn io::Read + Send>, StorageError> {
        let path = self.ensure_readable(artifact_id)?;
        Ok(Box::new(fs::File::open(path)?))
    }

    fn artifact_class(&self, _artifact_id: &str) -> crate::retention::ArtifactClass {
        crate::retention::ArtifactClass::RawSeed
    }

    fn artifact_modified_epoch(&self, artifact_id: &str) -> Option<i64> {
        if Self::validate_artifact_id(artifact_id).is_err() {
            return None;
        }
        let path = self.artifact_path(artifact_id);
        let metadata = fs::metadata(&path).ok()?;
        let modified = metadata.modified().ok()?;
        let duration = modified
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        Some(duration.as_secs() as i64)
    }
}

/// In-memory artifact storage.
///
/// The reference backend for the conformance suite (#1830): every mutation is
/// one locked map operation, which is the atomicity bar every other backend has
/// to meet. TTL is honoured with the same "expiry reads as absence" rule as the
/// filesystem backend.
pub struct MemoryArtifactStore {
    entries: std::sync::Mutex<std::collections::HashMap<String, MemoryEntry>>,
}

#[derive(Debug, Clone)]
struct MemoryEntry {
    bytes: Vec<u8>,
    stored_at_epoch: u64,
    expires_at_epoch: Option<u64>,
}

impl MemoryArtifactStore {
    pub fn new() -> Self {
        Self {
            entries: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    fn now_epoch_secs() -> u64 {
        LocalArtifactStore::now_epoch_secs()
    }

    /// Returns the entry when it exists and has not expired, purging an
    /// expired one on the way out.
    fn live_entry(&self, artifact_id: &str) -> Option<MemoryEntry> {
        let mut guard = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let entry = guard.get(artifact_id)?;
        if entry
            .expires_at_epoch
            .map_or(false, |expiry| Self::now_epoch_secs() >= expiry)
        {
            guard.remove(artifact_id);
            return None;
        }
        Some(entry.clone())
    }

    fn metadata_for(artifact_id: &str, entry: &MemoryEntry) -> ArtifactMetadata {
        let created_at = chrono::DateTime::<chrono::Utc>::from(
            std::time::UNIX_EPOCH + std::time::Duration::from_secs(entry.stored_at_epoch),
        )
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        ArtifactMetadata {
            id: artifact_id.to_string(),
            name: format!("{}.json", artifact_id),
            size_bytes: entry.bytes.len() as u64,
            created_at,
        }
    }
}

impl Default for MemoryArtifactStore {
    fn default() -> Self {
        Self::new()
    }
}

impl ArtifactStore for MemoryArtifactStore {
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError> {
        validate_artifact_id(artifact_id)?;
        let bytes = crate::save_case_bundle_json(bundle)?;
        let entry = MemoryEntry {
            bytes,
            stored_at_epoch: Self::now_epoch_secs(),
            expires_at_epoch: None,
        };
        let metadata = Self::metadata_for(artifact_id, &entry);
        self.entries
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(artifact_id.to_string(), entry);
        Ok(metadata)
    }

    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError> {
        let bytes = self.retrieve_artifact_bytes(artifact_id)?;
        crate::load_case_bundle_json(&bytes).map_err(|e| StorageError::Corrupt {
            artifact_id: artifact_id.to_string(),
            detail: e.to_string(),
        })
    }

    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError> {
        validate_artifact_id(artifact_id)?;
        self.live_entry(artifact_id)
            .map(|entry| Self::metadata_for(artifact_id, &entry))
            .ok_or_else(|| StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            })
    }

    fn list_artifacts(&self) -> Result<Vec<ArtifactMetadata>, StorageError> {
        let mut guard = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let now = Self::now_epoch_secs();
        guard.retain(|_, entry| entry.expires_at_epoch.map_or(true, |expiry| now < expiry));

        let mut artifacts: Vec<ArtifactMetadata> = guard
            .iter()
            .map(|(id, entry)| Self::metadata_for(id, entry))
            .collect();
        artifacts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(artifacts)
    }

    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError> {
        validate_artifact_id(artifact_id)?;
        self.entries
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(artifact_id);
        Ok(())
    }

    fn artifact_exists(&self, artifact_id: &str) -> bool {
        validate_artifact_id(artifact_id).is_ok() && self.live_entry(artifact_id).is_some()
    }

    fn store_artifact_with_ttl(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
        ttl_secs: u64,
    ) -> Result<ArtifactMetadata, StorageError> {
        validate_artifact_id(artifact_id)?;
        let bytes = crate::save_case_bundle_json(bundle)?;
        let now = Self::now_epoch_secs();
        let entry = MemoryEntry {
            bytes,
            stored_at_epoch: now,
            expires_at_epoch: Some(now.saturating_add(ttl_secs)),
        };
        let metadata = Self::metadata_for(artifact_id, &entry);
        self.entries
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(artifact_id.to_string(), entry);
        Ok(metadata)
    }

    fn artifact_ttl_remaining(&self, artifact_id: &str) -> Option<u64> {
        validate_artifact_id(artifact_id).ok()?;
        let entry = self.live_entry(artifact_id)?;
        let expiry = entry.expires_at_epoch?;
        Some(expiry.saturating_sub(Self::now_epoch_secs()))
    }

    fn retrieve_artifact_bytes(&self, artifact_id: &str) -> Result<Vec<u8>, StorageError> {
        validate_artifact_id(artifact_id)?;
        self.live_entry(artifact_id)
            .map(|entry| entry.bytes)
            .ok_or_else(|| StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            })
    }

    fn artifact_class(&self, _artifact_id: &str) -> crate::retention::ArtifactClass {
        crate::retention::ArtifactClass::RawSeed
    }

    fn artifact_modified_epoch(&self, artifact_id: &str) -> Option<i64> {
        validate_artifact_id(artifact_id).ok()?;
        self.live_entry(artifact_id)
            .map(|entry| entry.stored_at_epoch as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, CaseSeed};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_tmp() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("crashlab-artifacts-{n}"))
    }

    #[test]
    fn store_and_retrieve_artifact() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4, 5],
        });

        let metadata = store
            .store_artifact("test-artifact", &bundle)
            .expect("store artifact");
        assert_eq!(metadata.id, "test-artifact");
        assert!(metadata.size_bytes > 0);

        let retrieved = store
            .retrieve_artifact("test-artifact")
            .expect("retrieve artifact");
        assert_eq!(retrieved.seed.id, bundle.seed.id);
        assert_eq!(retrieved.seed.payload, bundle.seed.payload);

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn artifact_exists_check() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        assert!(!store.artifact_exists("nonexistent"));
        store
            .store_artifact("existing", &bundle)
            .expect("store artifact");
        assert!(store.artifact_exists("existing"));

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn list_multiple_artifacts() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");

        for i in 0..3 {
            let bundle = to_bundle(CaseSeed {
                id: i,
                payload: vec![i as u8],
            });
            store
                .store_artifact(&format!("artifact-{}", i), &bundle)
                .expect("store artifact");
        }

        let artifacts = store.list_artifacts().expect("list artifacts");
        assert_eq!(artifacts.len(), 3);

        for artifact in artifacts {
            assert!(artifact.id.starts_with("artifact-"));
            assert!(artifact.size_bytes > 0);
        }

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn delete_artifact() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        store
            .store_artifact("to-delete", &bundle)
            .expect("store artifact");
        assert!(store.artifact_exists("to-delete"));

        store.delete_artifact("to-delete").expect("delete artifact");
        assert!(!store.artifact_exists("to-delete"));

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn reject_invalid_artifact_ids() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        let invalid_ids = vec![
            "",
            "..",
            "../etc/passwd",
            "id/with/slash",
            "id\\with\\backslash",
        ];

        for invalid_id in invalid_ids {
            let result = store.store_artifact(invalid_id, &bundle);
            assert!(result.is_err(), "should reject invalid ID: {}", invalid_id);
        }

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn accept_ids_with_consecutive_dots() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        let valid_ids = vec![
            "run-v2..1",
            "artifact..name",
            "test..file",
            "..foo",
            "bar..",
        ];

        for valid_id in valid_ids {
            let result = store.store_artifact(valid_id, &bundle);
            assert!(
                result.is_ok(),
                "should accept ID with consecutive dots: {}",
                valid_id
            );
            let _ = store.delete_artifact(valid_id);
        }

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn retrieve_nonexistent_artifact() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");

        let result = store.retrieve_artifact("nonexistent");
        assert!(result.is_err());
        match result {
            Err(StorageError::NotFound { artifact_id }) => assert_eq!(artifact_id, "nonexistent"),
            _ => panic!("expected NotFound error"),
        }

        let _ = fs::remove_dir_all(&tmpdir);
    }

    #[test]
    fn get_artifact_metadata_without_contents() {
        let tmpdir = unique_tmp();
        let store = LocalArtifactStore::new(&tmpdir).expect("create store");
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3],
        });

        store
            .store_artifact("metadata-test", &bundle)
            .expect("store artifact");

        let metadata = store
            .get_artifact_metadata("metadata-test")
            .expect("get metadata");
        assert_eq!(metadata.id, "metadata-test");
        assert!(metadata.size_bytes > 0);
        assert!(!metadata.created_at.is_empty());

        let _ = fs::remove_dir_all(&tmpdir);
    }
}
