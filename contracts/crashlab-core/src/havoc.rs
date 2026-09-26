//! Havoc-style mutation strategy for smart contract inputs and XDR structures.
//!
//! Replaces trivial XOR-only mutation with a weighted, length-aware havoc strategy
//! consisting of:
//! - [`HavocOp::ByteFlip`]: Bit-flips, byte inversion, arithmetic tweaks, or random byte replacement
//! - [`HavocOp::BlockCopy`]: Copying a slice of bytes from one offset to another
//! - [`HavocOp::BlockInsert`]: Inserting random or patterned bytes, expanding payload
//! - [`HavocOp::BlockDelete`]: Deleting a slice of bytes, shrinking payload
//! - [`HavocOp::ChunkRepeat`]: Repeating an existing chunk multiple times
//! - [`HavocOp::XdrTagFlip`]: XDR/enum-tag aware flips reusing [`crate::enum_flip`] definitions

use crate::enum_flip::{ENUM_MARKER, INVALID_TAGS, VALID_TAGS};
use crate::scheduler::Mutator;
use crate::CaseSeed;

/// The individual operations supported by the havoc mutator.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HavocOp {
    ByteFlip,
    BlockCopy,
    BlockInsert,
    BlockDelete,
    ChunkRepeat,
    XdrTagFlip,
}

impl HavocOp {
    /// All available havoc operations.
    pub const ALL: [Self; 6] = [
        Self::ByteFlip,
        Self::BlockCopy,
        Self::BlockInsert,
        Self::BlockDelete,
        Self::ChunkRepeat,
        Self::XdrTagFlip,
    ];
}

/// Configuration parameters for the havoc mutation engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HavocConfig {
    /// Minimum allowed payload length in bytes (default: 1).
    pub min_len: usize,
    /// Maximum allowed payload length in bytes (default: 4096).
    pub max_len: usize,
    /// Maximum bytes to insert, delete, or copy in a single block operation (default: 32).
    pub max_growth: usize,
    /// Relative weight for [`HavocOp::ByteFlip`] (default: 20).
    pub weight_byte_flip: u32,
    /// Relative weight for [`HavocOp::BlockCopy`] (default: 15).
    pub weight_block_copy: u32,
    /// Relative weight for [`HavocOp::BlockInsert`] (default: 15).
    pub weight_block_insert: u32,
    /// Relative weight for [`HavocOp::BlockDelete`] (default: 15).
    pub weight_block_delete: u32,
    /// Relative weight for [`HavocOp::ChunkRepeat`] (default: 15).
    pub weight_chunk_repeat: u32,
    /// Relative weight for [`HavocOp::XdrTagFlip`] (default: 20).
    pub weight_xdr_tag_flip: u32,
}

impl Default for HavocConfig {
    fn default() -> Self {
        Self {
            min_len: 1,
            max_len: 4096,
            max_growth: 32,
            weight_byte_flip: 20,
            weight_block_copy: 15,
            weight_block_insert: 15,
            weight_block_delete: 15,
            weight_chunk_repeat: 15,
            weight_xdr_tag_flip: 20,
        }
    }
}

impl HavocConfig {
    /// Total combined weight of all operations.
    pub fn total_weight(&self) -> u32 {
        self.weight_byte_flip
            + self.weight_block_copy
            + self.weight_block_insert
            + self.weight_block_delete
            + self.weight_chunk_repeat
            + self.weight_xdr_tag_flip
    }
}

/// Fast SplitMix64 step for deterministic pseudo-random state transitions.
pub(crate) fn next_u64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

pub(crate) fn next_usize(state: &mut u64) -> usize {
    next_u64(state) as usize
}

pub(crate) fn next_range(state: &mut u64, min: usize, max: usize) -> usize {
    if min >= max {
        min
    } else {
        min + (next_usize(state) % (max - min + 1))
    }
}

pub(crate) fn next_byte(state: &mut u64) -> u8 {
    (next_u64(state) >> 56) as u8
}

/// Selects a havoc operation based on configured weights.
pub fn select_op(config: &HavocConfig, rng_state: &mut u64) -> HavocOp {
    let total = config.total_weight();
    if total == 0 {
        return HavocOp::ByteFlip;
    }

    let pick = (next_u64(rng_state) % (total as u64)) as u32;
    let mut acc = 0;

    acc += config.weight_byte_flip;
    if pick < acc {
        return HavocOp::ByteFlip;
    }
    acc += config.weight_block_copy;
    if pick < acc {
        return HavocOp::BlockCopy;
    }
    acc += config.weight_block_insert;
    if pick < acc {
        return HavocOp::BlockInsert;
    }
    acc += config.weight_block_delete;
    if pick < acc {
        return HavocOp::BlockDelete;
    }
    acc += config.weight_chunk_repeat;
    if pick < acc {
        return HavocOp::ChunkRepeat;
    }
    HavocOp::XdrTagFlip
}

fn apply_byte_flip(payload: &mut Vec<u8>, _config: &HavocConfig, rng_state: &mut u64) {
    if payload.is_empty() {
        payload.push(next_byte(rng_state));
        return;
    }
    let idx = next_usize(rng_state) % payload.len();
    match next_usize(rng_state) % 4 {
        0 => {
            // Flip a single random bit (always changes the byte)
            let bit = next_usize(rng_state) % 8;
            payload[idx] ^= 1 << bit;
        }
        1 => {
            // Invert byte bits
            payload[idx] ^= 0xFF;
        }
        2 => {
            // Small arithmetic tweak (+1 or -1)
            let delta = if (next_u64(rng_state) & 1) == 1 { 1u8 } else { 0xFFu8 };
            payload[idx] = payload[idx].wrapping_add(delta);
        }
        _ => {
            // Replace with a guaranteed different byte
            let old = payload[idx];
            let mut new_b = next_byte(rng_state);
            if new_b == old {
                new_b = old ^ 0xAA;
            }
            payload[idx] = new_b;
        }
    }
}

fn apply_block_copy(payload: &mut Vec<u8>, config: &HavocConfig, rng_state: &mut u64) {
    if payload.len() < 2 {
        apply_byte_flip(payload, config, rng_state);
        return;
    }
    let max_len = (payload.len() / 2).min(config.max_growth).max(1);
    let copy_len = next_range(rng_state, 1, max_len);
    let src = next_usize(rng_state) % (payload.len() - copy_len + 1);
    let mut dst = next_usize(rng_state) % (payload.len() - copy_len + 1);
    if src == dst {
        dst = if src + copy_len < payload.len() {
            src + 1
        } else if src > 0 {
            src - 1
        } else {
            dst
        };
    }
    let chunk = payload[src..src + copy_len].to_vec();
    payload[dst..dst + copy_len].copy_from_slice(&chunk);
    // Ensure mutation isn't a no-op if source and destination happened to match
    apply_byte_flip(payload, config, rng_state);
}

fn apply_block_insert(payload: &mut Vec<u8>, config: &HavocConfig, rng_state: &mut u64) {
    if payload.len() >= config.max_len {
        apply_byte_flip(payload, config, rng_state);
        return;
    }
    let room = config.max_len - payload.len();
    let ins_len = next_range(rng_state, 1, room.min(config.max_growth));
    let pos = if payload.is_empty() {
        0
    } else {
        next_usize(rng_state) % (payload.len() + 1)
    };

    let data: Vec<u8> = if (next_u64(rng_state) & 1) == 1 {
        let b = next_byte(rng_state);
        vec![b; ins_len]
    } else {
        (0..ins_len).map(|_| next_byte(rng_state)).collect()
    };
    payload.splice(pos..pos, data);
}

fn apply_block_delete(payload: &mut Vec<u8>, config: &HavocConfig, rng_state: &mut u64) {
    if payload.len() <= config.min_len {
        apply_block_insert(payload, config, rng_state);
        return;
    }
    let excess = payload.len() - config.min_len;
    let del_len = next_range(rng_state, 1, excess.min(config.max_growth));
    let pos = next_usize(rng_state) % (payload.len() - del_len + 1);
    payload.drain(pos..pos + del_len);
}

fn apply_chunk_repeat(payload: &mut Vec<u8>, config: &HavocConfig, rng_state: &mut u64) {
    if payload.is_empty() || payload.len() >= config.max_len {
        apply_block_insert(payload, config, rng_state);
        return;
    }
    let room = config.max_len - payload.len();
    let max_chunk = payload.len().min(config.max_growth).max(1);
    let chunk_len = next_range(rng_state, 1, max_chunk);
    let pos = next_usize(rng_state) % (payload.len() - chunk_len + 1);
    let chunk = payload[pos..pos + chunk_len].to_vec();

    let max_repeats = (room / chunk_len).min(4).max(1);
    let count = next_range(rng_state, 1, max_repeats);
    let insert_pos = pos + chunk_len;
    let mut insertion = Vec::with_capacity(chunk_len * count);
    for _ in 0..count {
        insertion.extend_from_slice(&chunk);
    }
    payload.splice(insert_pos..insert_pos, insertion);
}

fn apply_xdr_tag_flip(payload: &mut Vec<u8>, config: &HavocConfig, rng_state: &mut u64) {
    // If payload contains an ENUM_MARKER with an adjacent tag, flip the tag
    if let Some(pos) = payload.iter().position(|&b| b == ENUM_MARKER) {
        if pos + 1 < payload.len() {
            let current_tag = payload[pos + 1];
            let use_invalid = (next_u64(rng_state) & 1) == 1;
            payload[pos + 1] = if use_invalid {
                INVALID_TAGS[next_usize(rng_state) % INVALID_TAGS.len()]
            } else {
                let mut idx = next_usize(rng_state) % VALID_TAGS.len();
                if VALID_TAGS[idx] == current_tag {
                    idx = (idx + 1) % VALID_TAGS.len();
                }
                VALID_TAGS[idx]
            };
            return;
        }
    }

    // Payload doesn't have an ENUM_MARKER; insert one with a valid/invalid tag
    let tag = if (next_u64(rng_state) & 1) == 1 {
        INVALID_TAGS[next_usize(rng_state) % INVALID_TAGS.len()]
    } else {
        VALID_TAGS[next_usize(rng_state) % VALID_TAGS.len()]
    };

    if payload.len() + 2 <= config.max_len {
        let insert_pos = if payload.is_empty() {
            0
        } else {
            next_usize(rng_state) % (payload.len() + 1)
        };
        payload.splice(insert_pos..insert_pos, [ENUM_MARKER, tag]);
    } else if payload.len() >= 2 {
        payload[0] = ENUM_MARKER;
        payload[1] = tag;
    } else {
        payload.clear();
        payload.push(ENUM_MARKER);
        payload.push(tag);
    }
}

/// Applies a specific havoc operation to `payload`.
pub fn apply_specific_op(
    payload: &mut Vec<u8>,
    op: HavocOp,
    config: &HavocConfig,
    rng_state: &mut u64,
) {
    match op {
        HavocOp::ByteFlip => apply_byte_flip(payload, config, rng_state),
        HavocOp::BlockCopy => apply_block_copy(payload, config, rng_state),
        HavocOp::BlockInsert => apply_block_insert(payload, config, rng_state),
        HavocOp::BlockDelete => apply_block_delete(payload, config, rng_state),
        HavocOp::ChunkRepeat => apply_chunk_repeat(payload, config, rng_state),
        HavocOp::XdrTagFlip => apply_xdr_tag_flip(payload, config, rng_state),
    }

    // Enforce configured payload length bounds
    if payload.len() < config.min_len {
        while payload.len() < config.min_len {
            payload.push(next_byte(rng_state));
        }
    } else if payload.len() > config.max_len {
        payload.truncate(config.max_len);
    }
}

/// Selects and applies a weighted havoc operation to `payload`.
pub fn apply_havoc_mutation(
    payload: &mut Vec<u8>,
    config: &HavocConfig,
    rng_state: &mut u64,
) -> HavocOp {
    let op = select_op(config, rng_state);
    apply_specific_op(payload, op, config, rng_state);
    op
}

/// Derives a deterministic PRNG state from a [`CaseSeed`]'s `id` and `payload`.
///
/// Uses FNV-1a hashing mixed with SplitMix64 constants so that any change in
/// either `id` or `payload` yields an entirely distinct mutation trajectory.
pub fn derive_seed_state(seed: &CaseSeed) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in seed.id.to_le_bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    for &b in &seed.payload {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let state = hash.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Havoc mutator implementing the [`Mutator`] trait.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HavocMutator {
    pub config: HavocConfig,
}

impl HavocMutator {
    pub fn new(config: HavocConfig) -> Self {
        Self { config }
    }
}

impl Mutator for HavocMutator {
    fn name(&self) -> &'static str {
        "havoc"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let mut payload = seed.payload.clone();
        apply_havoc_mutation(&mut payload, &self.config, rng_state);
        CaseSeed {
            id: seed.id,
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_mutation_is_deterministic_given_seed_state() {
        let test_seeds = vec![
            CaseSeed { id: 0, payload: vec![] },
            CaseSeed { id: 1, payload: vec![42] },
            CaseSeed { id: 7, payload: vec![1, 2, 3, 4] },
            CaseSeed { id: 100, payload: vec![0xAA; 64] },
            CaseSeed { id: u64::MAX, payload: vec![0xE0, 0x01, 0x02, 0x03] },
        ];

        for seed in &test_seeds {
            let mut state1 = derive_seed_state(seed);
            let mut payload1 = seed.payload.clone();
            apply_havoc_mutation(&mut payload1, &HavocConfig::default(), &mut state1);

            let mut state2 = derive_seed_state(seed);
            let mut payload2 = seed.payload.clone();
            apply_havoc_mutation(&mut payload2, &HavocConfig::default(), &mut state2);

            assert_eq!(payload1, payload2, "seed id {} was not deterministic", seed.id);
            assert_eq!(state1, state2);
        }
    }

    #[test]
    fn property_mutation_never_self_inverse_over_two_steps() {
        let test_cases = vec![
            vec![],
            vec![1],
            vec![1, 2],
            vec![0, 0, 0, 0],
            vec![0xFF, 0xFF, 0xFF, 0xFF],
            vec![1, 2, 3, 4, 5, 6, 7, 8],
            vec![0xE0, 0x00, 0x10, 0x20],
            (0..64u8).collect(),
        ];

        for (id, payload) in test_cases.into_iter().enumerate() {
            let s0 = CaseSeed {
                id: id as u64,
                payload,
            };

            // Step 1: S0 -> S1
            let mut state0 = derive_seed_state(&s0);
            let mut p1 = s0.payload.clone();
            apply_havoc_mutation(&mut p1, &HavocConfig::default(), &mut state0);
            let s1 = CaseSeed {
                id: s0.id,
                payload: p1,
            };

            assert_ne!(
                s1.payload, s0.payload,
                "first mutation did not alter payload for seed id={}",
                id
            );

            // Step 2: S1 -> S2
            let mut state1 = derive_seed_state(&s1);
            let mut p2 = s1.payload.clone();
            apply_havoc_mutation(&mut p2, &HavocConfig::default(), &mut state1);
            let s2 = CaseSeed {
                id: s1.id,
                payload: p2,
            };

            assert_ne!(
                s2.payload, s0.payload,
                "mutation was self-inverse over two steps for seed id={}: s0={:?}, s1={:?}, s2={:?}",
                id, s0.payload, s1.payload, s2.payload
            );
        }
    }

    #[test]
    fn property_coverage_of_each_op_type() {
        let config = HavocConfig::default();
        let mut rng = 12345u64;

        // 1. ByteFlip coverage
        let mut p_flip = vec![0xAA; 16];
        apply_specific_op(&mut p_flip, HavocOp::ByteFlip, &config, &mut rng);
        assert_ne!(p_flip, vec![0xAA; 16]);

        // 2. BlockCopy coverage
        let mut p_copy = vec![1, 2, 3, 4, 5, 6, 7, 8];
        apply_specific_op(&mut p_copy, HavocOp::BlockCopy, &config, &mut rng);
        assert_ne!(p_copy, vec![1, 2, 3, 4, 5, 6, 7, 8]);

        // 3. BlockInsert coverage
        let mut p_ins = vec![10, 20, 30];
        apply_specific_op(&mut p_ins, HavocOp::BlockInsert, &config, &mut rng);
        assert!(p_ins.len() > 3);

        // 4. BlockDelete coverage
        let mut p_del = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        apply_specific_op(&mut p_del, HavocOp::BlockDelete, &config, &mut rng);
        assert!(p_del.len() < 10);

        // 5. ChunkRepeat coverage
        let mut p_rep = vec![1, 2, 3, 4];
        apply_specific_op(&mut p_rep, HavocOp::ChunkRepeat, &config, &mut rng);
        assert!(p_rep.len() > 4);

        // 6. XdrTagFlip coverage
        let mut p_xdr = vec![ENUM_MARKER, 0x00, 0xAA, 0xBB];
        apply_specific_op(&mut p_xdr, HavocOp::XdrTagFlip, &config, &mut rng);
        assert_eq!(p_xdr[0], ENUM_MARKER);
        assert_ne!(p_xdr[1], 0x00);

        // 7. Weighted selection exercises all 6 op types
        let mut seen = std::collections::HashSet::new();
        let mut sample_rng = 42u64;
        let mut dummy = vec![1, 2, 3, 4, 5, 6, 7, 8];
        for _ in 0..500 {
            let op = apply_havoc_mutation(&mut dummy, &config, &mut sample_rng);
            seen.insert(op);
        }
        for op in HavocOp::ALL {
            assert!(seen.contains(&op), "HavocOp::{:?} was never selected", op);
        }
    }

    #[test]
    fn property_length_bounds_respected() {
        let config = HavocConfig {
            min_len: 4,
            max_len: 16,
            max_growth: 8,
            ..Default::default()
        };
        let mut rng = 9999u64;

        // Starts below min_len
        let mut p = vec![1];
        for _ in 0..100 {
            apply_havoc_mutation(&mut p, &config, &mut rng);
            assert!(p.len() >= config.min_len, "len {} < min_len {}", p.len(), config.min_len);
            assert!(p.len() <= config.max_len, "len {} > max_len {}", p.len(), config.max_len);
        }

        // Starts above max_len
        let mut p_large = vec![0xFF; 50];
        apply_havoc_mutation(&mut p_large, &config, &mut rng);
        assert!(p_large.len() <= config.max_len);
    }
}
