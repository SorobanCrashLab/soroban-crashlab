//! Storage backend integration for persisting and retrieving crash artifacts.
//!
//! This module provides a pluggable storage abstraction that supports multiple
//! backends (local filesystem, cloud storage, etc.) for artifact persistence,
//! retrieval, and listing operations. All operations preserve artifact integrity
//! through content-addressed storage and deterministic versioning.

use crate::{CaseBundle, BundlePersistError};
use std::path::{Path, PathBuf};
use std::fs;
use std::io;

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
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::Io(e) => write!(f, "storage I/O error: {e}"),
            StorageError::Persistence(e) => write!(f, "artifact persistence error: {e}"),
            StorageError::NotFound { artifact_id } => write!(f, "artifact not found: {artifact_id}"),
            StorageError::InvalidId { artifact_id } => write!(f, "invalid artifact ID: {artifact_id}"),
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
    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError>;

    /// Checks if an artifact exists in storage.
    fn artifact_exists(&self, artifact_id: &str) -> bool;

    /// Returns the artifact class for retention policy purposes.
    ///
    /// Defaults to `ArtifactClass::Raw` for backends that do not track classes.
    fn artifact_class(&self, _artifact_id: &str) -> crate::retention::ArtifactClass {
        crate::retention::ArtifactClass::Raw
    }

    /// Returns the last-modified timestamp (epoch seconds) for an artifact.
    ///
    /// Used by lease-based retention sweeps to compute artifact age.
    fn artifact_modified_epoch(&self, _artifact_id: &str) -> Option<i64> {
        None
    }
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
        if id.is_empty() || id == ".." || id.contains("/") || id.contains("\\") {
            return Err(StorageError::InvalidId {
                artifact_id: id.to_string(),
            });
        }
        Ok(())
    }

    /// Constructs the filesystem path for an artifact.
    fn artifact_path(&self, artifact_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.json", artifact_id))
    }

    /// Extracts metadata from an artifact ID and file metadata.
    fn metadata_from_file(artifact_id: &str, path: &Path) -> Result<ArtifactMetadata, StorageError> {
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
}

impl ArtifactStore for LocalArtifactStore {
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError> {
        Self::validate_artifact_id(artifact_id)?;

        let path = self.artifact_path(artifact_id);
        let json_bytes = crate::save_case_bundle_json(bundle)?;
        fs::write(&path, json_bytes)?;

        Self::metadata_from_file(artifact_id, &path)
    }

    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError> {
        Self::validate_artifact_id(artifact_id)?;

        let path = self.artifact_path(artifact_id);
        if !path.exists() {
            return Err(StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            });
        }

        let bytes = fs::read(&path)?;
        Ok(crate::load_case_bundle_json(&bytes)?)
    }

    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError> {
        Self::validate_artifact_id(artifact_id)?;

        let path = self.artifact_path(artifact_id);
        if !path.exists() {
            return Err(StorageError::NotFound {
                artifact_id: artifact_id.to_string(),
            });
        }

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
        Ok(())
    }

    fn artifact_exists(&self, artifact_id: &str) -> bool {
        Self::validate_artifact_id(artifact_id).is_ok()
            && self.artifact_path(artifact_id).exists()
    }

    fn artifact_class(&self, artifact_id: &str) -> crate::retention::ArtifactClass {
        crate::retention::ArtifactClass::classify(artifact_id)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use crate::{to_bundle, CaseSeed};

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

        let invalid_ids = vec!["", "..", "../etc/passwd", "id/with/slash", "id\\with\\backslash"];

        for invalid_id in invalid_ids {
            let result = store.store_artifact(invalid_id, &bundle);
            assert!(
                result.is_err(),
                "should reject invalid ID: {}",
                invalid_id
            );
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

        let valid_ids = vec!["run-v2..1", "artifact..name", "test..file", "..foo", "bar.."];

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
