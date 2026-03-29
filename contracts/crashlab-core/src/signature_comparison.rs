//! Signature comparison for regression detection.
//!
//! Compares current run signatures against baseline snapshots to detect regressions,
//! distinguishing between new, fixed, and recurring failures.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// A signature snapshot for baseline comparison.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureSnapshot {
    /// Unique snapshot identifier.
    pub id: String,
    /// Snapshot description/label.
    pub label: String,
    /// Failure signatures in this snapshot.
    pub signatures: HashMap<String, SignatureInfo>,
    /// Timestamp when snapshot was created (ISO 8601).
    pub created_at: Option<String>,
}

/// Information about a single failure signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignatureInfo {
    /// Signature hash/digest.
    pub hash: String,
    /// Failure category.
    pub category: String,
    /// Number of times observed.
    pub occurrence_count: usize,
    /// First observed timestamp.
    pub first_seen: Option<String>,
    /// Last observed timestamp.
    pub last_seen: Option<String>,
}

/// Result of comparing current signatures against a baseline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureComparisonResult {
    /// Signatures present in current but not in baseline (new failures).
    pub new_signatures: Vec<String>,
    /// Signatures present in baseline but not in current (fixed failures).
    pub fixed_signatures: Vec<String>,
    /// Signatures present in both (recurring failures).
    pub recurring_signatures: Vec<String>,
    /// Detailed comparison metrics.
    pub metrics: ComparisonMetrics,
}

/// Metrics from signature comparison.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComparisonMetrics {
    /// Total unique signatures in baseline.
    pub baseline_total: usize,
    /// Total unique signatures in current.
    pub current_total: usize,
    /// Number of new signatures discovered.
    pub new_count: usize,
    /// Number of signatures that have been fixed.
    pub fixed_count: usize,
    /// Number of signatures recurring from baseline.
    pub recurring_count: usize,
    /// Regression indicator: true if new_count > 0 and fixed_count == 0.
    pub has_regressions: bool,
}

/// Error type for signature comparison operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComparisonError {
    /// Snapshot not found.
    SnapshotNotFound(String),
    /// Signature not found in snapshot.
    SignatureNotFound(String),
    /// Validation failed.
    ValidationFailed(String),
    /// Serialization error.
    SerializationError(String),
}

impl fmt::Display for ComparisonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ComparisonError::SnapshotNotFound(id) => write!(f, "snapshot not found: {id}"),
            ComparisonError::SignatureNotFound(sig) => write!(f, "signature not found: {sig}"),
            ComparisonError::ValidationFailed(msg) => write!(f, "validation failed: {msg}"),
            ComparisonError::SerializationError(msg) => write!(f, "serialization error: {msg}"),
        }
    }
}

impl std::error::Error for ComparisonError {}

impl SignatureSnapshot {
    /// Creates a new signature snapshot.
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            signatures: HashMap::new(),
            created_at: None,
        }
    }

    /// Adds a signature to the snapshot.
    pub fn add_signature(
        &mut self,
        hash: impl Into<String>,
        category: impl Into<String>,
        occurrence_count: usize,
    ) -> Result<(), ComparisonError> {
        let hash_str = hash.into();
        if hash_str.is_empty() {
            return Err(ComparisonError::ValidationFailed(
                "signature hash cannot be empty".to_string(),
            ));
        }

        let category_str = category.into();
        if category_str.is_empty() {
            return Err(ComparisonError::ValidationFailed(
                "category cannot be empty".to_string(),
            ));
        }

        self.signatures.insert(
            hash_str.clone(),
            SignatureInfo {
                hash: hash_str,
                category: category_str,
                occurrence_count,
                first_seen: None,
                last_seen: None,
            },
        );

        Ok(())
    }

    /// Gets a signature by hash.
    pub fn get_signature(&self, hash: &str) -> Result<&SignatureInfo, ComparisonError> {
        self.signatures
            .get(hash)
            .ok_or_else(|| ComparisonError::SignatureNotFound(hash.to_string()))
    }

    /// Validates snapshot.
    pub fn validate(&self) -> Result<(), ComparisonError> {
        if self.id.is_empty() {
            return Err(ComparisonError::ValidationFailed(
                "snapshot id cannot be empty".to_string(),
            ));
        }
        if self.label.is_empty() {
            return Err(ComparisonError::ValidationFailed(
                "snapshot label cannot be empty".to_string(),
            ));
        }
        Ok(())
    }

    /// Serializes snapshot to JSON.
    pub fn to_json(&self) -> Result<String, ComparisonError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| ComparisonError::SerializationError(e.to_string()))
    }

    /// Deserializes snapshot from JSON.
    pub fn from_json(json: &str) -> Result<Self, ComparisonError> {
        let snapshot: SignatureSnapshot = serde_json::from_str(json)
            .map_err(|e| ComparisonError::SerializationError(e.to_string()))?;
        snapshot.validate()?;
        Ok(snapshot)
    }
}

/// Compares current signatures against a baseline snapshot.
pub fn compare_signatures(
    baseline: &SignatureSnapshot,
    current_signatures: &HashMap<String, SignatureInfo>,
) -> SignatureComparisonResult {
    let baseline_keys: std::collections::HashSet<_> = baseline.signatures.keys().cloned().collect();
    let current_keys: std::collections::HashSet<_> = current_signatures.keys().cloned().collect();

    let new_signatures: Vec<String> = current_keys
        .difference(&baseline_keys)
        .cloned()
        .collect();
    let fixed_signatures: Vec<String> = baseline_keys
        .difference(&current_keys)
        .cloned()
        .collect();
    let recurring_signatures: Vec<String> = baseline_keys
        .intersection(&current_keys)
        .cloned()
        .collect();

    let has_regressions = !new_signatures.is_empty();

    let metrics = ComparisonMetrics {
        baseline_total: baseline.signatures.len(),
        current_total: current_signatures.len(),
        new_count: new_signatures.len(),
        fixed_count: fixed_signatures.len(),
        recurring_count: recurring_signatures.len(),
        has_regressions,
    };

    SignatureComparisonResult {
        new_signatures,
        fixed_signatures,
        recurring_signatures,
        metrics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_creation() {
        let snapshot = SignatureSnapshot::new("snap-001", "v1.0 baseline");
        assert_eq!(snapshot.id, "snap-001");
        assert_eq!(snapshot.label, "v1.0 baseline");
    }

    #[test]
    fn test_add_signature() {
        let mut snapshot = SignatureSnapshot::new("snap-001", "test");
        assert!(snapshot
            .add_signature("sig-abc123", "panic", 5)
            .is_ok());
        assert_eq!(snapshot.signatures.len(), 1);

        let sig = snapshot.get_signature("sig-abc123").unwrap();
        assert_eq!(sig.category, "panic");
        assert_eq!(sig.occurrence_count, 5);
    }

    #[test]
    fn test_empty_hash_validation() {
        let mut snapshot = SignatureSnapshot::new("snap-001", "test");
        assert!(snapshot.add_signature("", "panic", 1).is_err());
    }

    #[test]
    fn test_snapshot_validation() {
        let valid = SignatureSnapshot::new("snap-001", "test");
        assert!(valid.validate().is_ok());

        let invalid_id = SignatureSnapshot::new("", "test");
        assert!(invalid_id.validate().is_err());
    }

    #[test]
    fn test_signature_comparison() {
        let mut baseline = SignatureSnapshot::new("snap-001", "baseline");
        baseline
            .add_signature("sig-a", "panic", 1)
            .unwrap();
        baseline
            .add_signature("sig-b", "assertion", 2)
            .unwrap();
        baseline
            .add_signature("sig-c", "oom", 1)
            .unwrap();

        let mut current = HashMap::new();
        current.insert(
            "sig-b".to_string(),
            SignatureInfo {
                hash: "sig-b".to_string(),
                category: "assertion".to_string(),
                occurrence_count: 2,
                first_seen: None,
                last_seen: None,
            },
        );
        current.insert(
            "sig-c".to_string(),
            SignatureInfo {
                hash: "sig-c".to_string(),
                category: "oom".to_string(),
                occurrence_count: 1,
                first_seen: None,
                last_seen: None,
            },
        );
        current.insert(
            "sig-d".to_string(),
            SignatureInfo {
                hash: "sig-d".to_string(),
                category: "segfault".to_string(),
                occurrence_count: 1,
                first_seen: None,
                last_seen: None,
            },
        );

        let result = compare_signatures(&baseline, &current);

        assert_eq!(result.new_signatures, vec!["sig-d"]);
        assert_eq!(result.fixed_signatures, vec!["sig-a"]);
        assert_eq!(result.recurring_signatures.len(), 2);
        assert!(result.metrics.has_regressions);
    }

    #[test]
    fn test_snapshot_serialization() {
        let mut snapshot = SignatureSnapshot::new("snap-001", "test");
        snapshot
            .add_signature("sig-abc", "panic", 5)
            .unwrap();

        let json = snapshot.to_json().unwrap();
        let restored = SignatureSnapshot::from_json(&json).unwrap();

        assert_eq!(snapshot.id, restored.id);
        assert_eq!(snapshot.signatures.len(), restored.signatures.len());
    }
}
