//! Enum-like variant/tag mutator for host input fuzzing.
//!
//! Payload layout:
//! - `[0]` discriminator marker (`0xE0`)
//! - `[1]` variant tag
//! - `[2..]` payload bytes

use crate::CaseSeed;
use crate::scheduler::Mutator;

const ENUM_MARKER: u8 = 0xE0;
const VALID_TAGS: [u8; 4] = [0x00, 0x01, 0x02, 0x03];
const INVALID_TAGS: [u8; 4] = [0x7F, 0x80, 0xFE, 0xFF];

/// Mutates enum-like payloads by flipping between valid variant tags and invalid tags.
pub struct EnumVariantFlipMutator;

impl Mutator for EnumVariantFlipMutator {
    fn name(&self) -> &'static str {
        "enum-variant-flip"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let mut payload = seed.payload.clone();
        if payload.len() < 3 {
            payload.resize(3, 0);
        }

        payload[0] = ENUM_MARKER;

        let current_tag = payload[1];
        let use_invalid = next_u64(rng_state) & 1 == 1;
        payload[1] = if use_invalid {
            INVALID_TAGS[(next_u64(rng_state) as usize) % INVALID_TAGS.len()]
        } else {
            let mut idx = (next_u64(rng_state) as usize) % VALID_TAGS.len();
            if VALID_TAGS[idx] == current_tag {
                idx = (idx + 1) % VALID_TAGS.len();
            }
            VALID_TAGS[idx]
        };

        for b in &mut payload[2..] {
            *b ^= next_u64(rng_state) as u8;
        }

        CaseSeed {
            id: seed.id,
            payload,
        }
    }
}

/// Returns true when `payload` is in enum layout and carries an invalid variant tag.
pub fn is_invalid_enum_tag_payload(payload: &[u8]) -> bool {
    if payload.len() < 2 || payload[0] != ENUM_MARKER {
        return false;
    }
    !VALID_TAGS.contains(&payload[1])
}

fn next_u64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutator_name_is_enum_variant_flip() {
        assert_eq!(EnumVariantFlipMutator.name(), "enum-variant-flip");
    }

    #[test]
    fn mutator_enforces_enum_marker_layout() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![1],
        };
        let out = EnumVariantFlipMutator.mutate(&seed, &mut 1u64);
        assert_eq!(out.payload[0], ENUM_MARKER);
        assert!(out.payload.len() >= 3);
    }

    #[test]
    fn invalid_tag_detection_only_flags_enum_layout() {
        assert!(!is_invalid_enum_tag_payload(&[0x00, 0xFF]));
        assert!(!is_invalid_enum_tag_payload(&[ENUM_MARKER, 0x01]));
        assert!(is_invalid_enum_tag_payload(&[ENUM_MARKER, 0xFE]));
    }

    #[test]
    fn deterministic_for_same_seed_and_rng() {
        let seed = CaseSeed {
            id: 9,
            payload: vec![0xE0, 0x00, 0xAA, 0xBB],
        };
        let a = EnumVariantFlipMutator.mutate(&seed, &mut 42u64);
        let b = EnumVariantFlipMutator.mutate(&seed, &mut 42u64);
        assert_eq!(a, b);
    }

    #[test]
    fn mutator_can_generate_invalid_tag() {
        let seed = CaseSeed {
            id: 2,
            payload: vec![0xE0, 0x00, 0x01],
        };
        let mut seen_invalid = false;
        for r in 0..128u64 {
            let out = EnumVariantFlipMutator.mutate(&seed, &mut r.clone());
            if is_invalid_enum_tag_payload(&out.payload) {
                seen_invalid = true;
                break;
            }
        }
        assert!(seen_invalid);
    }
}