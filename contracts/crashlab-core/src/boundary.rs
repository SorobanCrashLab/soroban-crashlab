//! Numeric boundary mutator for i128 and u128 overflow/underflow testing.
//!
//! This module generates edge-case payloads near the min/max boundaries of
//! `i128` and `u128`, targeting arithmetic overflow and underflow failures in
//! Soroban smart contracts.
//!
//! ## Key Components
//! - [`BoundaryMutator`]: A [`Mutator`] implementation that replaces seed
//!   payloads with 16-byte little-endian encodings of boundary values.
//! - [`boundary_values_i128`] / [`boundary_values_u128`]: The canonical sets
//!   of edge values used for mutation.
//! - [`generate_boundary_vectors`]: Produces a complete set of [`CaseSeed`]s
//!   covering every boundary value for both types.
//!
//! ## Encoding
//!
//! All numeric values are encoded as **16-byte little-endian** byte arrays,
//! matching the native Soroban host representation for 128-bit integers.

use crate::scheduler::Mutator;
use crate::CaseSeed;

/// Canonical boundary values for `i128`, ordered from most negative to most
/// positive.  Each value targets a different overflow/underflow edge:
///
/// | Value            | Rationale                                 |
/// |------------------|-------------------------------------------|
/// | `i128::MIN`      | Signed minimum — negation overflows       |
/// | `i128::MIN + 1`  | Neighbor just above signed minimum        |
/// | `-1`             | Decrement-from-zero / wrap-around trigger  |
/// | `0`              | Zero crossing, off-by-one anchor          |
/// | `1`              | Increment-from-zero / off-by-one anchor   |
/// | `i128::MAX - 1`  | Neighbor just below signed maximum        |
/// | `i128::MAX`      | Signed maximum — increment overflows      |
pub fn boundary_values_i128() -> Vec<i128> {
    vec![i128::MIN, i128::MIN + 1, -1, 0, 1, i128::MAX - 1, i128::MAX]
}

/// Canonical boundary values for `u128`.
///
/// | Value            | Rationale                                 |
/// |------------------|-------------------------------------------|
/// | `0` (`u128::MIN`)| Unsigned minimum — decrement underflows   |
/// | `1`              | Neighbor just above unsigned minimum      |
/// | `u128::MAX - 1`  | Neighbor just below unsigned maximum      |
/// | `u128::MAX`      | Unsigned maximum — increment overflows    |
pub fn boundary_values_u128() -> Vec<u128> {
    vec![u128::MIN, u128::MIN + 1, u128::MAX - 1, u128::MAX]
}

/// All distinct 16-byte boundary payloads for both `i128` and `u128`.
///
/// Values that share the same little-endian encoding (e.g. `0_i128` and
/// `0_u128`) are included once. The returned list is deterministically ordered
/// and de-duplicated.
pub fn all_boundary_payloads() -> Vec<[u8; 16]> {
    let mut payloads: Vec<[u8; 16]> = Vec::new();

    for v in boundary_values_i128() {
        payloads.push(v.to_le_bytes());
    }
    for v in boundary_values_u128() {
        let bytes = v.to_le_bytes();
        if !payloads.contains(&bytes) {
            payloads.push(bytes);
        }
    }

    payloads
}

/// Mutator that injects numeric boundary values into seed payloads.
///
/// On each call to [`mutate`][Mutator::mutate] the mutator deterministically
/// selects a boundary value from the combined `i128`/`u128` set using
/// `rng_state`, then writes its 16-byte little-endian encoding into the
/// payload.  Any existing payload content beyond 16 bytes is preserved.
///
/// # Integration with [`WeightedScheduler`][crate::scheduler::WeightedScheduler]
///
/// ```rust
/// # use crashlab_core::scheduler::{WeightedScheduler, Mutator};
/// # use crashlab_core::boundary::BoundaryMutator;
/// # fn main() {
/// let mutators: Vec<(Box<dyn Mutator>, f64)> = vec![
///     (Box::new(BoundaryMutator), 5.0),
/// ];
/// let scheduler = WeightedScheduler::new(mutators).unwrap();
/// # }
/// ```
pub struct BoundaryMutator;

impl Mutator for BoundaryMutator {
    fn name(&self) -> &'static str {
        "numeric-boundary"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let payloads = all_boundary_payloads();
        let index = next_index(rng_state, payloads.len());
        let boundary_bytes = &payloads[index];

        let mut payload = seed.payload.clone();
        if payload.len() < 16 {
            payload.resize(16, 0);
        }
        payload[..16].copy_from_slice(boundary_bytes);

        CaseSeed {
            id: seed.id,
            payload,
        }
    }
}

/// Generates a complete set of [`CaseSeed`]s covering every boundary value
/// for both `i128` and `u128`.
///
/// Seeds are numbered starting from `base_id`, incrementing by one for each
/// boundary value.  The returned vector has a deterministic, stable order.
///
/// # Example
///
/// ```rust
/// use crashlab_core::boundary::generate_boundary_vectors;
///
/// let vectors = generate_boundary_vectors(100);
/// assert!(!vectors.is_empty());
/// assert_eq!(vectors[0].id, 100);
/// assert_eq!(vectors[0].payload.len(), 16);
/// ```
pub fn generate_boundary_vectors(base_id: u64) -> Vec<CaseSeed> {
    all_boundary_payloads()
        .into_iter()
        .enumerate()
        .map(|(i, bytes)| CaseSeed {
            id: base_id + i as u64,
            payload: bytes.to_vec(),
        })
        .collect()
}

/// Selects an index in `[0, len)` from `rng_state` using the same splitmix64
/// transformation used elsewhere in the crate.
fn next_index(state: &mut u64, len: usize) -> usize {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z = z ^ (z >> 31);
    (z as usize) % len
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── boundary value sets ──────────────────────────────────────────────────

    #[test]
    fn i128_boundaries_include_min_and_max() {
        let vals = boundary_values_i128();
        assert!(vals.contains(&i128::MIN));
        assert!(vals.contains(&i128::MAX));
    }

    #[test]
    fn i128_boundaries_include_min_max_neighbors() {
        let vals = boundary_values_i128();
        assert!(vals.contains(&(i128::MIN + 1)));
        assert!(vals.contains(&(i128::MAX - 1)));
    }

    #[test]
    fn i128_boundaries_include_zero_crossing() {
        let vals = boundary_values_i128();
        assert!(vals.contains(&-1));
        assert!(vals.contains(&0));
        assert!(vals.contains(&1));
    }

    #[test]
    fn u128_boundaries_include_min_and_max() {
        let vals = boundary_values_u128();
        assert!(vals.contains(&u128::MIN));
        assert!(vals.contains(&u128::MAX));
    }

    #[test]
    fn u128_boundaries_include_min_max_neighbors() {
        let vals = boundary_values_u128();
        assert!(vals.contains(&(u128::MIN + 1)));
        assert!(vals.contains(&(u128::MAX - 1)));
    }

    #[test]
    fn all_boundary_payloads_are_16_bytes() {
        for payload in all_boundary_payloads() {
            assert_eq!(payload.len(), 16);
        }
    }

    #[test]
    fn all_boundary_payloads_are_deduplicated() {
        let payloads = all_boundary_payloads();
        for (i, a) in payloads.iter().enumerate() {
            for (j, b) in payloads.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b, "duplicate payload at indices {} and {}", i, j);
                }
            }
        }
    }

    #[test]
    fn all_boundary_payloads_contain_i128_min_encoding() {
        let expected = i128::MIN.to_le_bytes();
        assert!(all_boundary_payloads().contains(&expected));
    }

    #[test]
    fn all_boundary_payloads_contain_i128_max_encoding() {
        let expected = i128::MAX.to_le_bytes();
        assert!(all_boundary_payloads().contains(&expected));
    }

    #[test]
    fn all_boundary_payloads_contain_u128_max_encoding() {
        let expected = u128::MAX.to_le_bytes();
        assert!(all_boundary_payloads().contains(&expected));
    }

    // ── BoundaryMutator ──────────────────────────────────────────────────────

    #[test]
    fn mutator_name_is_numeric_boundary() {
        assert_eq!(BoundaryMutator.name(), "numeric-boundary");
    }

    #[test]
    fn mutator_produces_16_byte_payload_from_short_seed() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0xAA],
        };
        let mut rng = 42u64;
        let result = BoundaryMutator.mutate(&seed, &mut rng);
        assert!(result.payload.len() >= 16);
    }

    #[test]
    fn mutator_preserves_trailing_bytes_beyond_16() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0xFF; 20],
        };
        let mut rng = 99u64;
        let result = BoundaryMutator.mutate(&seed, &mut rng);
        assert_eq!(result.payload.len(), 20);
        assert_eq!(&result.payload[16..], &[0xFF; 4]);
    }

    #[test]
    fn mutator_preserves_seed_id() {
        let seed = CaseSeed {
            id: 777,
            payload: vec![0; 16],
        };
        let mut rng = 0u64;
        let result = BoundaryMutator.mutate(&seed, &mut rng);
        assert_eq!(result.id, 777);
    }

    #[test]
    fn mutator_is_deterministic_for_same_rng() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0; 16],
        };
        let result_a = BoundaryMutator.mutate(&seed, &mut 42u64);
        let result_b = BoundaryMutator.mutate(&seed, &mut 42u64);
        assert_eq!(result_a, result_b);
    }

    #[test]
    fn mutator_output_is_a_known_boundary_value() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0; 16],
        };
        let known = all_boundary_payloads();
        let mut rng = 42u64;

        let result = BoundaryMutator.mutate(&seed, &mut rng);
        let first_16: [u8; 16] = result.payload[..16].try_into().unwrap();
        assert!(
            known.contains(&first_16),
            "mutator output is not a recognized boundary value"
        );
    }

    #[test]
    fn mutator_advances_rng_state() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0; 16],
        };
        let mut rng = 42u64;
        BoundaryMutator.mutate(&seed, &mut rng);
        assert_ne!(rng, 42, "rng_state must advance after mutation");
    }

    #[test]
    fn different_rng_seeds_can_produce_different_boundaries() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0; 16],
        };
        let payloads: Vec<Vec<u8>> = (0..100u64)
            .map(|r| BoundaryMutator.mutate(&seed, &mut r.clone()).payload)
            .collect();

        let unique: std::collections::HashSet<&Vec<u8>> = payloads.iter().collect();
        assert!(
            unique.len() > 1,
            "expected multiple distinct boundary values across different rng seeds"
        );
    }

    // ── generate_boundary_vectors ────────────────────────────────────────────

    #[test]
    fn vectors_start_at_base_id() {
        let vectors = generate_boundary_vectors(100);
        assert_eq!(vectors[0].id, 100);
    }

    #[test]
    fn vectors_have_sequential_ids() {
        let vectors = generate_boundary_vectors(0);
        for (i, v) in vectors.iter().enumerate() {
            assert_eq!(v.id, i as u64);
        }
    }

    #[test]
    fn vectors_cover_all_boundary_payloads() {
        let vectors = generate_boundary_vectors(0);
        let expected = all_boundary_payloads();
        assert_eq!(vectors.len(), expected.len());

        for (vec, exp) in vectors.iter().zip(expected.iter()) {
            assert_eq!(vec.payload.as_slice(), exp.as_slice());
        }
    }

    #[test]
    fn vectors_all_have_16_byte_payloads() {
        for v in generate_boundary_vectors(0) {
            assert_eq!(v.payload.len(), 16);
        }
    }

    #[test]
    fn vectors_include_i128_min_payload() {
        let expected = i128::MIN.to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include i128::MIN"
        );
    }

    #[test]
    fn vectors_include_i128_max_payload() {
        let expected = i128::MAX.to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include i128::MAX"
        );
    }

    #[test]
    fn vectors_include_u128_max_payload() {
        let expected = u128::MAX.to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include u128::MAX"
        );
    }

    #[test]
    fn vectors_include_i128_min_neighbor_payload() {
        let expected = (i128::MIN + 1).to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include i128::MIN + 1"
        );
    }

    #[test]
    fn vectors_include_i128_max_neighbor_payload() {
        let expected = (i128::MAX - 1).to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include i128::MAX - 1"
        );
    }

    #[test]
    fn vectors_include_u128_max_neighbor_payload() {
        let expected = (u128::MAX - 1).to_le_bytes().to_vec();
        let vectors = generate_boundary_vectors(0);
        assert!(
            vectors.iter().any(|v| v.payload == expected),
            "boundary vectors must include u128::MAX - 1"
        );
    }

    #[test]
    fn vectors_are_deterministic() {
        let a = generate_boundary_vectors(0);
        let b = generate_boundary_vectors(0);
        assert_eq!(a, b);
    }

    // ── round-trip verification ──────────────────────────────────────────────

    #[test]
    fn i128_min_round_trips_through_le_bytes() {
        let bytes = i128::MIN.to_le_bytes();
        assert_eq!(i128::from_le_bytes(bytes), i128::MIN);
    }

    #[test]
    fn i128_max_round_trips_through_le_bytes() {
        let bytes = i128::MAX.to_le_bytes();
        assert_eq!(i128::from_le_bytes(bytes), i128::MAX);
    }

    #[test]
    fn u128_max_round_trips_through_le_bytes() {
        let bytes = u128::MAX.to_le_bytes();
        assert_eq!(u128::from_le_bytes(bytes), u128::MAX);
    }

    // ── Mutator trait compliance ─────────────────────────────────────────────

    #[test]
    fn boundary_mutator_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<BoundaryMutator>();
    }
}
