/// Deterministic pseudo-random number generator keyed by a seed ID.
///
/// Uses the xorshift64* algorithm, which is fully deterministic for a given
/// seed and produces statistically well-distributed output with no external
/// dependencies.
///
/// # Guarantees
///
/// The same `seed_id` always produces the same mutation stream, independent of
/// the run environment or invocation order.
///
/// # Example
///
/// ```rust
/// use crashlab_core::prng::SeededPrng;
///
/// let mut rng = SeededPrng::new(42);
/// let stream_a = rng.mutation_stream(8);
///
/// let mut rng2 = SeededPrng::new(42);
/// let stream_b = rng2.mutation_stream(8);
///
/// assert_eq!(stream_a, stream_b);
/// ```
#[derive(Debug, Clone)]
pub struct SeededPrng {
    state: u64,
}

impl SeededPrng {
    /// Creates a new PRNG seeded by `seed_id`.
    ///
    /// The seed is mixed with a golden-ratio constant to avoid degenerate
    /// zero-state even when `seed_id` is 0.
    pub fn new(seed_id: u64) -> Self {
        // Mix the seed so seed_id=0 still produces a valid non-zero state.
        let state = seed_id.wrapping_add(1).wrapping_mul(0x9E3779B97F4A7C15);
        Self { state }
    }

    /// Returns a deterministic float in `[0, 1)` (53-bit precision) for jitter and sampling.
    pub fn next_f64(&mut self) -> f64 {
        const SCALE: f64 = 1.0 / (1u64 << 53) as f64;
        (self.next_u64() >> 11) as f64 * SCALE
    }

    /// Advances the PRNG state and returns the next 64-bit value.
    pub fn next_u64(&mut self) -> u64 {
        // xorshift64*
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Returns the next byte from the mutation stream.
    pub fn next_byte(&mut self) -> u8 {
        (self.next_u64() >> 56) as u8
    }

    /// Returns a deterministic byte stream of length `len` for this seed.
    pub fn mutation_stream(&mut self, len: usize) -> Vec<u8> {
        (0..len).map(|_| self.next_byte()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_produces_same_stream() {
        let mut a = SeededPrng::new(7);
        let mut b = SeededPrng::new(7);
        assert_eq!(a.mutation_stream(32), b.mutation_stream(32));
    }

    #[test]
    fn different_seeds_produce_different_streams() {
        let mut a = SeededPrng::new(1);
        let mut b = SeededPrng::new(2);
        assert_ne!(a.mutation_stream(16), b.mutation_stream(16));
    }

    #[test]
    fn zero_seed_does_not_produce_all_zeros() {
        let mut rng = SeededPrng::new(0);
        let stream = rng.mutation_stream(16);
        assert!(stream.iter().any(|&b| b != 0));
    }

    #[test]
    fn stream_is_stable_across_independent_instances() {
        // Reproduce byte-by-byte to confirm sequential state advances match.
        let mut rng1 = SeededPrng::new(99);
        let mut rng2 = SeededPrng::new(99);
        for _ in 0..64 {
            assert_eq!(rng1.next_byte(), rng2.next_byte());
        }
    }

    #[test]
    fn large_seed_is_handled() {
        let mut a = SeededPrng::new(u64::MAX);
        let mut b = SeededPrng::new(u64::MAX);
        assert_eq!(a.mutation_stream(20), b.mutation_stream(20));
    }
}
