//! Decimal precision/scale mutator for token-math boundary fuzzing.

use crate::CaseSeed;
use crate::scheduler::Mutator;

const DECIMAL_MARKER: u8 = 0xD3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecimalBoundaryCase {
    pub precision: u8,
    pub scale: u8,
    pub coefficient: i128,
    pub rounding_trap: bool,
}

/// Canonical decimal boundary cases that stress rounding and overflow edges.
pub fn decimal_boundary_cases() -> Vec<DecimalBoundaryCase> {
    vec![
        DecimalBoundaryCase {
            precision: 38,
            scale: 0,
            coefficient: i128::MAX,
            rounding_trap: false,
        },
        DecimalBoundaryCase {
            precision: 38,
            scale: 0,
            coefficient: i128::MAX - 1,
            rounding_trap: false,
        },
        DecimalBoundaryCase {
            precision: 38,
            scale: 0,
            coefficient: i128::MIN + 1,
            rounding_trap: false,
        },
        DecimalBoundaryCase {
            precision: 1,
            scale: 1,
            coefficient: 5,
            rounding_trap: true,
        },
        DecimalBoundaryCase {
            precision: 2,
            scale: 1,
            coefficient: 15,
            rounding_trap: true,
        },
        DecimalBoundaryCase {
            precision: 6,
            scale: 7,
            coefficient: 999_999,
            rounding_trap: true,
        },
    ]
}

/// Mutator that encodes decimal boundary tuples into payload bytes.
pub struct DecimalPrecisionMutator;

impl Mutator for DecimalPrecisionMutator {
    fn name(&self) -> &'static str {
        "decimal-precision"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let cases = decimal_boundary_cases();
        let idx = (next_u64(rng_state) as usize) % cases.len();
        let chosen = cases[idx];

        let mut payload = encode_decimal_case(chosen);
        for b in &mut payload[20..] {
            *b ^= next_u64(rng_state) as u8;
        }

        CaseSeed {
            id: seed.id,
            payload,
        }
    }
}

/// Encodes decimal case into fixed payload format:
/// [marker, precision, scale, trap, coefficient(16 bytes LE), fuzz-tail(4 bytes)]
pub fn encode_decimal_case(case: DecimalBoundaryCase) -> Vec<u8> {
    let mut out = vec![0u8; 24];
    out[0] = DECIMAL_MARKER;
    out[1] = case.precision;
    out[2] = case.scale;
    out[3] = if case.rounding_trap { 1 } else { 0 };
    out[4..20].copy_from_slice(&case.coefficient.to_le_bytes());
    out
}

/// Returns deterministic seed vectors for each decimal boundary case.
pub fn generate_decimal_precision_vectors(base_id: u64) -> Vec<CaseSeed> {
    decimal_boundary_cases()
        .into_iter()
        .enumerate()
        .map(|(i, c)| CaseSeed {
            id: base_id + i as u64,
            payload: encode_decimal_case(c),
        })
        .collect()
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
    fn mutator_name_is_decimal_precision() {
        assert_eq!(DecimalPrecisionMutator.name(), "decimal-precision");
    }

    #[test]
    fn boundaries_include_rounding_traps() {
        let cases = decimal_boundary_cases();
        assert!(cases.iter().any(|c| c.rounding_trap));
    }

    #[test]
    fn boundaries_include_near_overflow_coefficients() {
        let cases = decimal_boundary_cases();
        assert!(cases.iter().any(|c| c.coefficient == i128::MAX));
        assert!(cases.iter().any(|c| c.coefficient == i128::MAX - 1));
        assert!(cases.iter().any(|c| c.coefficient == i128::MIN + 1));
    }

    #[test]
    fn encode_decimal_case_layout_is_stable() {
        let encoded = encode_decimal_case(DecimalBoundaryCase {
            precision: 9,
            scale: 2,
            coefficient: 12345,
            rounding_trap: true,
        });
        assert_eq!(encoded.len(), 24);
        assert_eq!(encoded[0], DECIMAL_MARKER);
        assert_eq!(encoded[1], 9);
        assert_eq!(encoded[2], 2);
        assert_eq!(encoded[3], 1);
    }

    #[test]
    fn mutator_is_deterministic() {
        let seed = CaseSeed {
            id: 5,
            payload: vec![1, 2, 3],
        };
        let a = DecimalPrecisionMutator.mutate(&seed, &mut 77u64);
        let b = DecimalPrecisionMutator.mutate(&seed, &mut 77u64);
        assert_eq!(a, b);
    }

    #[test]
    fn generated_vectors_cover_all_boundaries() {
        let vectors = generate_decimal_precision_vectors(100);
        assert_eq!(vectors.len(), decimal_boundary_cases().len());
        assert_eq!(vectors[0].id, 100);
    }
}