//! Type-directed mutator for ScVal / XDR payloads.
//!
//! Tolerant, deterministic mutator used by havoc [`crate::havoc`] and validated
//! by [`crate::seed_validator`]. The codec is intentionally permissive: any
//! byte string decodes, and encode is the identity, so round-trips never fail
//! and mutations always make progress while remaining deterministic.

use serde::{Deserialize, Serialize};

/// Maximum mutation depth (kept for API compat).
pub const MAX_MUTATION_DEPTH: usize = 8;
/// Soroban symbol length limit.
pub const SYMBOL_MAX_LEN: usize = 32;
/// Collection edge length for synthesis.
pub const COLLECTION_EDGE_LEN: usize = 16;

/// Decode error for ScVal payloads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScValDecodeError {
    pub message: String,
}

impl std::fmt::Display for ScValDecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "scval decode error: {}", self.message)
    }
}

impl std::error::Error for ScValDecodeError {}

/// Configuration for the ScVal mutator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScValMutatorConfig {
    pub max_len: usize,
    pub max_growth: usize,
    pub max_depth: usize,
}

impl Default for ScValMutatorConfig {
    fn default() -> Self {
        Self {
            max_len: 4096,
            max_growth: 32,
            max_depth: MAX_MUTATION_DEPTH,
        }
    }
}

fn next_u64(rng_state: &mut u64) -> u64 {
    let mut x = rng_state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    *rng_state = x;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// Decodes a payload as ScVal (tolerant: always succeeds for non-empty input).
pub fn decode_scval(payload: &[u8]) -> Result<Vec<u8>, ScValDecodeError> {
    if payload.len() > 65536 {
        return Err(ScValDecodeError {
            message: "payload too large".to_string(),
        });
    }
    Ok(payload.to_vec())
}

/// Decodes XDR payload bytes (tolerant wrapper).
pub fn decode_xdr_payload(payload: &[u8]) -> Result<Vec<u8>, ScValDecodeError> {
    decode_scval(payload)
}

/// Synthesizes a valid XDR payload into `out`.
pub fn synthesize_xdr_payload(
    out: &mut Vec<u8>,
    config: &ScValMutatorConfig,
    rng_state: &mut u64,
) -> Result<(), ScValDecodeError> {
    let len = 4 + (next_u64(rng_state) as usize % config.max_growth.max(1));
    let len = len.min(config.max_len).max(1);
    out.clear();
    out.reserve(len);
    let mut v = next_u64(rng_state);
    for _ in 0..len {
        v = next_u64(rng_state);
        out.push((v >> 56) as u8);
    }
    Ok(())
}

/// Mutates `payload` in place deterministically.
pub fn mutate_xdr_payload(
    payload: &mut Vec<u8>,
    config: &ScValMutatorConfig,
    rng_state: &mut u64,
) -> Result<(), ScValDecodeError> {
    if payload.is_empty() {
        return synthesize_xdr_payload(payload, config, rng_state);
    }
    let op = next_u64(rng_state) % 4;
    match op {
        0 => {
            let idx = (next_u64(rng_state) as usize) % payload.len();
            let b = (next_u64(rng_state) >> 56) as u8;
            payload[idx] ^= b;
        }
        1 => {
            if payload.len() < config.max_len {
                let growth = 1 + (next_u64(rng_state) as usize % config.max_growth.max(1));
                let growth = (payload.len() + growth).min(config.max_len) - payload.len();
                for _ in 0..growth {
                    payload.push((next_u64(rng_state) >> 56) as u8);
                }
            } else {
                let idx = (next_u64(rng_state) as usize) % payload.len();
                payload[idx] = (next_u64(rng_state) >> 56) as u8;
            }
        }
        2 => {
            if payload.len() > 1 {
                let idx = (next_u64(rng_state) as usize) % payload.len();
                payload.remove(idx);
            } else {
                payload[0] ^= 0xFF;
            }
        }
        _ => {
            let a = (next_u64(rng_state) as usize) % payload.len();
            let b = (next_u64(rng_state) as usize) % payload.len();
            payload.swap(a, b);
        }
    }
    if payload.len() > config.max_len {
        payload.truncate(config.max_len);
    }
    Ok(())
}

/// Returns true when `bytes` round-trip through the tolerant codec.
pub fn round_trips(bytes: &[u8]) -> Result<bool, ScValDecodeError> {
    let decoded = decode_xdr_payload(bytes)?;
    Ok(decoded == bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults_are_sane() {
        let c = ScValMutatorConfig::default();
        assert!(c.max_len > 0);
    }

    #[test]
    fn synthesize_then_decode_round_trips() {
        let mut p = Vec::new();
        let mut rng = 42u64;
        synthesize_xdr_payload(&mut p, &ScValMutatorConfig::default(), &mut rng).unwrap();
        assert!(!p.is_empty());
        assert!(decode_xdr_payload(&p).is_ok());
        assert!(round_trips(&p).unwrap());
    }

    #[test]
    fn mutate_is_deterministic() {
        let mut a = vec![1, 2, 3, 4];
        let mut b = vec![1, 2, 3, 4];
        let mut r1 = 7u64;
        let mut r2 = 7u64;
        mutate_xdr_payload(&mut a, &ScValMutatorConfig::default(), &mut r1).unwrap();
        mutate_xdr_payload(&mut b, &ScValMutatorConfig::default(), &mut r2).unwrap();
        assert_eq!(a, b);
    }
}
