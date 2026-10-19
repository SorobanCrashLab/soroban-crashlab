//! Type-directed ScVal/XDR mutator (stub).
//!
//! This module provides a minimal, self-contained ScVal/XDR codec and
//! type-directed mutator. The full implementation was corrupted in a prior
//! commit; this stub restores the public API surface so `havoc.rs` and
//! `seed_validator.rs` compile. All operations return errors so callers fall
//! back to byte-level mutation, preserving existing behavior.

use std::fmt;

/// Errors from encoding/decoding ScVal trees.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum ScValCodecError {
    /// The bytes could not be decoded into an ScVal tree.
    Decode(String),
    /// The tree could not be encoded back into XDR bytes (harness bug).
    Encode(String),
}

/// Alias used by `seed_validator.rs` for decode failures.
pub type ScValDecodeError = ScValCodecError;

impl fmt::Display for ScValCodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScValCodecError::Decode(msg) => write!(f, "scval decode error: {msg}"),
            ScValCodecError::Encode(msg) => write!(f, "scval encode error (harness bug): {msg}"),
        }
    }
}

impl std::error::Error for ScValCodecError {}

/// Configuration for the type-directed mutator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScValMutatorConfig {
    /// Maximum payload length in bytes.
    pub max_len: usize,
    /// Maximum growth allowed during mutation in bytes.
    pub max_growth: usize,
    /// Maximum number of mutations to apply per call.
    pub max_mutations: usize,
    /// Maximum tree depth for synthesized trees.
    pub max_depth: usize,
}

impl Default for ScValMutatorConfig {
    fn default() -> Self {
        Self {
            max_len: 4096,
            max_growth: 1024,
            max_mutations: 4,
            max_depth: 8,
        }
    }
}

/// Tolerant ScVal tree node (opaque to callers).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScValNode;

/// Attempts to mutate an XDR payload in place using type-directed operations.
///
/// Returns `Err` in this stub so `havoc.rs` falls back to byte-level mutation.
pub fn mutate_xdr_payload(
    _payload: &mut Vec<u8>,
    _config: &ScValMutatorConfig,
    _rng_state: &mut u64,
) -> Result<(), ScValCodecError> {
    Err(ScValCodecError::Decode(
        "scval mutator unavailable — using byte-level fallback".to_string(),
    ))
}

/// Synthesizes a new XDR payload from scratch.
///
/// Returns `Err` in this stub.
pub fn synthesize_xdr_payload(
    _payload: &mut Vec<u8>,
    _config: &ScValMutatorConfig,
    _rng: &mut u64,
) -> Result<(), ScValCodecError> {
    Err(ScValCodecError::Decode(
        "scval synthesis unavailable".to_string(),
    ))
}

/// Decodes an XDR payload into an ScVal tree.
///
/// Returns `Err` in this stub.
pub fn decode_xdr_payload(_payload: &[u8]) -> Result<ScValNode, ScValCodecError> {
    Err(ScValCodecError::Decode(
        "scval decode unavailable".to_string(),
    ))
}

/// Decodes an ScVal from a raw payload (used by `seed_validator.rs`).
///
/// Returns `Err` in this stub so validation reports a decode error.
pub fn decode_scval(_payload: &[u8]) -> Result<(), ScValDecodeError> {
    Err(ScValDecodeError::Decode(
        "scval decode unavailable".to_string(),
    ))
}
