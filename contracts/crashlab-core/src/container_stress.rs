//! Vec / map size stress mutator for host container inputs.
//!
//! Encodes a mode (vector vs map), bounded sizes, and a sparse key stride into a
//! compact payload. Sizes are clamped to configured min/max bounds; generation is
//! deterministic from `(seed, rng_state)` like other mutators.

use crate::scheduler::Mutator;
use crate::CaseSeed;

/// Bounds for encoded container dimensions (inclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContainerStressConfig {
    pub vec_size_min: u64,
    pub vec_size_max: u64,
    pub map_size_min: u64,
    pub map_size_max: u64,
}

impl Default for ContainerStressConfig {
    fn default() -> Self {
        Self {
            vec_size_min: 0,
            vec_size_max: 256,
            map_size_min: 0,
            map_size_max: 128,
        }
    }
}

impl ContainerStressConfig {
    pub fn new(vec_size_min: u64, vec_size_max: u64, map_size_min: u64, map_size_max: u64) -> Self {
        Self {
            vec_size_min,
            vec_size_max,
            map_size_min,
            map_size_max,
        }
    }

    fn clamp(&self, v: u64, min: u64, max: u64) -> u64 {
        if max < min {
            return min;
        }
        v.min(max).max(min)
    }

    fn pick_in_range(&self, rng: &mut u64, min: u64, max: u64) -> u64 {
        advance_rng(rng);
        if max <= min {
            return min;
        }
        let span = max - min + 1;
        let pick = *rng % span;
        min + pick
    }
}

/// Mutator that stresses Soroban-style vec growth vs sparse map key patterns.
pub struct ContainerStressMutator {
    pub config: ContainerStressConfig,
}

impl ContainerStressMutator {
    pub fn new(config: ContainerStressConfig) -> Self {
        Self { config }
    }

    pub fn default_mutator() -> Self {
        Self::new(ContainerStressConfig::default())
    }
}

/// Payload layout (32 bytes, within default 64-byte seed cap):
/// - `[0]` mode: `0xD0` vec, `0xD1` map
/// - `[1..9]` primary size (`u64` LE), meaning vec length or map entry count
/// - `[9..17]` secondary (`u64` LE) — companion bound or sparse stride
/// - `[17..32]` pattern fill derived from rng
fn build_payload(config: &ContainerStressConfig, seed: &CaseSeed, rng_state: &mut u64) -> Vec<u8> {
    let use_map = (*rng_state ^ seed.id) & 1 == 1;
    let vec_sz = config.pick_in_range(rng_state, config.vec_size_min, config.vec_size_max);
    let map_sz = config.pick_in_range(rng_state, config.map_size_min, config.map_size_max);
    let stride = config.pick_in_range(rng_state, 1, map_sz.max(1));

    let mut out = vec![0u8; 32];
    if use_map {
        out[0] = 0xD1;
        let primary = config.clamp(map_sz, config.map_size_min, config.map_size_max);
        let secondary = config.clamp(stride, 1, u64::max(map_sz, 1));
        out[1..9].copy_from_slice(&primary.to_le_bytes());
        out[9..17].copy_from_slice(&secondary.to_le_bytes());
    } else {
        out[0] = 0xD0;
        let primary = config.clamp(vec_sz, config.vec_size_min, config.vec_size_max);
        let secondary = config.clamp(
            vec_sz.wrapping_add(map_sz),
            config.vec_size_min,
            config.vec_size_max,
        );
        out[1..9].copy_from_slice(&primary.to_le_bytes());
        out[9..17].copy_from_slice(&secondary.to_le_bytes());
    }

    for i in 17..32 {
        advance_rng(rng_state);
        out[i] = (*rng_state ^ seed.id.wrapping_add(i as u64)) as u8;
    }

    out
}

fn advance_rng(state: &mut u64) {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    *state = z ^ (z >> 31);
}

impl Mutator for ContainerStressMutator {
    fn name(&self) -> &'static str {
        "container-stress"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        CaseSeed {
            id: seed.id,
            payload: build_payload(&self.config, seed, rng_state),
        }
    }
}

/// Deterministic [`CaseSeed`] grid across config bounds (for corpus / tests).
pub fn generate_container_stress_grid(
    base_id: u64,
    config: &ContainerStressConfig,
) -> Vec<CaseSeed> {
    let mut out = Vec::new();
    let mut id = base_id;
    let v_steps = config
        .vec_size_max
        .saturating_sub(config.vec_size_min)
        .min(8);
    let m_steps = config
        .map_size_max
        .saturating_sub(config.map_size_min)
        .min(8);

    for vi in 0..=v_steps {
        for mi in 0..=m_steps {
            let v = config.vec_size_min + vi;
            let m = config.map_size_min + mi;
            let mut payload = vec![0u8; 32];
            payload[0] = 0xD0;
            payload[1..9].copy_from_slice(&v.to_le_bytes());
            payload[9..17].copy_from_slice(&m.to_le_bytes());
            for i in 17..32 {
                payload[i] = (id.wrapping_add(i as u64) ^ vi as u64 ^ mi as u64) as u8;
            }
            out.push(CaseSeed { id, payload });
            id += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutator_name() {
        assert_eq!(
            ContainerStressMutator::default_mutator().name(),
            "container-stress"
        );
    }

    #[test]
    fn deterministic_for_same_inputs() {
        let m = ContainerStressMutator::default_mutator();
        let seed = CaseSeed {
            id: 10,
            payload: vec![1, 2, 3],
        };
        let a = m.mutate(&seed, &mut 99u64);
        let b = m.mutate(&seed, &mut 99u64);
        assert_eq!(a, b);
    }

    #[test]
    fn respects_vec_bounds() {
        let cfg = ContainerStressConfig::new(5, 10, 0, 2);
        let m = ContainerStressMutator::new(cfg);
        let seed = CaseSeed {
            id: 1,
            payload: vec![0xFF; 40],
        };
        for r in 0..50u64 {
            let mut rng = r;
            let out = m.mutate(&seed, &mut rng);
            if out.payload[0] == 0xD0 {
                let vec_sz = u64::from_le_bytes(out.payload[1..9].try_into().unwrap());
                assert!(vec_sz >= 5 && vec_sz <= 10);
            }
        }
    }

    #[test]
    fn respects_map_bounds() {
        let cfg = ContainerStressConfig::new(0, 1, 20, 30);
        let m = ContainerStressMutator::new(cfg);
        let seed = CaseSeed {
            id: 2,
            payload: vec![0xAB; 20],
        };
        for r in 0..80u64 {
            let mut rng = r.wrapping_mul(0xFFFF);
            let out = m.mutate(&seed, &mut rng);
            if out.payload[0] == 0xD1 {
                let map_sz = u64::from_le_bytes(out.payload[1..9].try_into().unwrap());
                assert!(map_sz >= 20 && map_sz <= 30);
            }
        }
    }

    #[test]
    fn grid_is_deterministic() {
        let cfg = ContainerStressConfig::new(1, 3, 1, 3);
        let a = generate_container_stress_grid(100, &cfg);
        let b = generate_container_stress_grid(100, &cfg);
        assert_eq!(a, b);
    }
}
