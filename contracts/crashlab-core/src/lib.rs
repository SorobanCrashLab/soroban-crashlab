pub mod auth_matrix;
pub mod reproducer;

pub use auth_matrix::{collect_mismatched, run_matrix, AuthMode, MatrixReport, ModeResult};
pub use reproducer::{filter_ci_pack, FlakyDetector, ReproReport};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseSeed {
    pub id: u64,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrashSignature {
    pub category: &'static str,
    pub digest: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseBundle {
    pub seed: CaseSeed,
    pub signature: CrashSignature,
}

pub fn mutate_seed(seed: &CaseSeed) -> CaseSeed {
    let mut x = seed.id ^ 0x9E37_79B9_7F4A_7C15;
    let mut payload = seed.payload.clone();

    for item in &mut payload {
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        let mask = (x as u8) & 0x0F;
        *item ^= mask;
    }

    CaseSeed {
        id: seed.id,
        payload,
    }
}

pub fn classify(seed: &CaseSeed) -> CrashSignature {
    let digest = seed
        .payload
        .iter()
        .fold(seed.id, |acc, b| acc.wrapping_mul(1099511628211).wrapping_add(*b as u64));

    let category = if seed.payload.is_empty() {
        "empty-input"
    } else if seed.payload.len() > 64 {
        "oversized-input"
    } else {
        "runtime-failure"
    };

    CrashSignature { category, digest }
}

pub fn to_bundle(seed: CaseSeed) -> CaseBundle {
    let mutated = mutate_seed(&seed);
    let signature = classify(&mutated);
    CaseBundle {
        seed: mutated,
        signature,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_is_deterministic() {
        let seed = CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        };
        let a = mutate_seed(&seed);
        let b = mutate_seed(&seed);
        assert_eq!(a, b);
    }

    #[test]
    fn classification_detects_empty_input() {
        let seed = CaseSeed {
            id: 7,
            payload: vec![],
        };
        let sig = classify(&seed);
        assert_eq!(sig.category, "empty-input");
    }

    #[test]
    fn bundle_contains_signature() {
        let seed = CaseSeed {
            id: 9,
            payload: vec![9, 9, 9],
        };
        let bundle = to_bundle(seed);
        assert!(!bundle.signature.category.is_empty());
    }
}
