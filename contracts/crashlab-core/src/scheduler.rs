//! Weighted mutator scheduler for the Soroban CrashLab fuzzer.
//!
//! This module provides a configurable scheduler that selects from a set of
//! registered mutators based on their relative weights. It is designed for
//! performance in the hot fuzzing loop, using a precomputed cumulative
//! distribution and binary search for O(log n) selection.
//!
//! ## Key Components
//! - [`Mutator`]: Trait for implementing mutation strategies.
//! - [`WeightedScheduler`]: The core selection engine with integrated stats tracking.
//! - [`SchedulerStats`]: Real-time reporting of mutator usage distribution.
//!
//! ## Example
//! ```rust
//! # use crashlab_core::scheduler::{WeightedScheduler, Mutator};
//! # use crashlab_core::CaseSeed;
//! # struct MyMutator;
//! # impl Mutator for MyMutator {
//! #     fn name(&self) -> &'static str { "mut" }
//! #     fn mutate(&self, seed: &CaseSeed, _: &mut u64) -> CaseSeed { seed.clone() }
//! # }
//! # fn main() {
//! let mutators: Vec<(Box<dyn Mutator>, f64)> = vec![
//!     (Box::new(MyMutator), 9.0),
//!     (Box::new(MyMutator), 1.0),
//! ];
//! let mut scheduler = WeightedScheduler::new(mutators).unwrap();
//! let mut rng = 42;
//! let mutator = scheduler.select_mutator(&mut rng);
//! # }
//! ```

use crate::CaseSeed;

/// A strategy for mutating a [`CaseSeed`] into a new variant.
pub trait Mutator: Send + Sync {
    /// Human-readable name of the mutator, used for stats and reporting.
    fn name(&self) -> &'static str;

    /// Produces a mutated version of `seed`.
    ///
    /// `rng_state` provides entropy and should be updated by the mutator if it
    /// performs multiple random choices.
    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed;
}

/// Statistics for a single mutator's lifecycle within a [`WeightedScheduler`].
#[derive(Debug, Clone, Default)]
pub struct MutatorStats {
    /// Total number of times this mutator was selected.
    pub selection_count: u64,
}

/// Configurable scheduler that selects mutators based on relative weights.
pub struct WeightedScheduler {
    mutators: Vec<Box<dyn Mutator>>,
    weights: Vec<f64>,
    cumulative_weights: Vec<f64>,
    total_weight: f64,
    stats: Vec<MutatorStats>,
    total_selections: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchedulerError {
    /// Initialised with an empty list of mutators.
    EmptyMutatorSet,
    /// All provided weights were zero. At least one non-zero weight is required.
    InvalidWeightConfiguration,
    /// Referenced a mutator index or identifier that does not exist.
    MutatorNotFound,
}

impl std::fmt::Display for SchedulerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchedulerError::EmptyMutatorSet => write!(f, "empty mutator set"),
            SchedulerError::InvalidWeightConfiguration => {
                write!(f, "invalid weight configuration: all weights are zero")
            }
            SchedulerError::MutatorNotFound => write!(f, "mutator not found"),
        }
    }
}

impl std::error::Error for SchedulerError {}

impl WeightedScheduler {
    /// Creates a new scheduler from a list of (Mutator, Weight) pairs.
    ///
    /// # Errors
    ///
    /// Returns [`SchedulerError::EmptyMutatorSet`] if `configs` is empty.
    /// Returns [`SchedulerError::InvalidWeightConfiguration`] if all weights are zero.
    pub fn new(configs: Vec<(Box<dyn Mutator>, f64)>) -> Result<Self, SchedulerError> {
        if configs.is_empty() {
            return Err(SchedulerError::EmptyMutatorSet);
        }

        let mut mutators = Vec::with_capacity(configs.len());
        let mut weights = Vec::with_capacity(configs.len());
        let mut total_weight = 0.0;

        for (mutator, weight) in configs {
            let w = if weight < 0.0 { 0.0 } else { weight };
            mutators.push(mutator);
            weights.push(w);
            total_weight += w;
        }

        if total_weight <= 0.0 {
            return Err(SchedulerError::InvalidWeightConfiguration);
        }

        let mut cumulative_weights = Vec::with_capacity(weights.len());
        let mut sum = 0.0;
        for &w in &weights {
            sum += w;
            cumulative_weights.push(sum);
        }

        let stats = vec![MutatorStats::default(); mutators.len()];

        Ok(Self {
            mutators,
            weights,
            cumulative_weights,
            total_weight,
            stats,
            total_selections: 0,
        })
    }

    /// Selects a mutator based on the precomputed distribution.
    ///
    /// Uses binary search for O(log n) selection.
    /// The `rng_state` is used to generate a random value in `[0, total_weight)`.
    pub fn select_mutator(&mut self, rng_state: &mut u64) -> &dyn Mutator {
        let r = next_f64(rng_state) * self.total_weight;

        // Binary search to find the index where cumulative_weights[i] >= r
        let index = match self.cumulative_weights.binary_search_by(|w| {
            if *w <= r {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        }) {
            Ok(i) => i,
            Err(i) => i,
        };

        // Clamp index to handles floating point edge cases at the very end of the range
        let index = index.min(self.mutators.len() - 1);

        self.total_selections += 1;
        self.stats[index].selection_count += 1;

        &*self.mutators[index]
    }

    /// Updates the weight of a mutator by index.
    ///
    /// Recomputes the cumulative distribution.
    pub fn update_weight(&mut self, index: usize, new_weight: f64) -> Result<(), SchedulerError> {
        if index >= self.weights.len() {
            return Err(SchedulerError::MutatorNotFound);
        }

        let w = if new_weight < 0.0 { 0.0 } else { new_weight };
        self.weights[index] = w;

        let mut total = 0.0;
        let mut sum = 0.0;
        let mut new_cumulative = Vec::with_capacity(self.weights.len());
        for &weight in &self.weights {
            total += weight;
            sum += weight;
            new_cumulative.push(sum);
        }

        if total <= 0.0 {
            return Err(SchedulerError::InvalidWeightConfiguration);
        }

        self.total_weight = total;
        self.cumulative_weights = new_cumulative;

        Ok(())
    }

    /// Returns a summary of mutator usage distribution.
    pub fn report_stats(&self) -> Vec<SchedulerStatEntry> {
        self.mutators
            .iter()
            .enumerate()
            .map(|(i, m)| {
                let count = self.stats[i].selection_count;
                let observed_frequency = if self.total_selections > 0 {
                    count as f64 / self.total_selections as f64
                } else {
                    0.0
                };
                let configured_frequency = self.weights[i] / self.total_weight;

                SchedulerStatEntry {
                    name: m.name(),
                    weight: self.weights[i],
                    count,
                    observed_frequency,
                    configured_frequency,
                }
            })
            .collect()
    }
}

/// A single entry in the scheduler's statistics report.
#[derive(Debug, Clone)]
pub struct SchedulerStatEntry {
    pub name: &'static str,
    pub weight: f64,
    pub count: u64,
    pub observed_frequency: f64,
    pub configured_frequency: f64,
}

/// Simple LCG-based PRNG to produce an f64 in [0, 1).
///
/// Follows the splitmix64-style transformation found in lib.rs for consistency.
fn next_f64(state: &mut u64) -> f64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z = z ^ (z >> 31);

    // Convert to f64 in [0, 1)
    (z as f64) / (u64::MAX as f64 + 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockMutator(&'static str);
    impl Mutator for MockMutator {
        fn name(&self) -> &'static str {
            self.0
        }
        fn mutate(&self, seed: &CaseSeed, _rng: &mut u64) -> CaseSeed {
            seed.clone()
        }
    }

    #[test]
    fn scheduler_initialises_correctly() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
            (Box::new(MockMutator("b")), 2.0),
        ];
        let scheduler = WeightedScheduler::new(configs).unwrap();
        assert_eq!(scheduler.total_weight, 3.0);
        assert_eq!(scheduler.cumulative_weights, vec![1.0, 3.0]);
    }

    #[test]
    fn scheduler_errors_on_empty_set() {
        let result = WeightedScheduler::new(vec![]);
        assert_eq!(result.err(), Some(SchedulerError::EmptyMutatorSet));
    }

    #[test]
    fn scheduler_errors_on_all_zero_weights() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 0.0),
            (Box::new(MockMutator("b")), 0.0),
        ];
        let result = WeightedScheduler::new(configs);
        assert_eq!(
            result.err(),
            Some(SchedulerError::InvalidWeightConfiguration)
        );
    }

    #[test]
    fn zero_weight_mutator_is_never_selected() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("active")), 1.0),
            (Box::new(MockMutator("inactive")), 0.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        let mut rng = 42;

        for _ in 0..100 {
            let m = scheduler.select_mutator(&mut rng);
            assert_eq!(m.name(), "active");
        }

        let stats = scheduler.report_stats();
        assert_eq!(stats[1].count, 0);
    }

    #[test]
    fn distribution_matches_weights() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 10.0),
            (Box::new(MockMutator("b")), 20.0),
            (Box::new(MockMutator("c")), 70.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        let mut rng = 12345;
        let samples = 10000;

        for _ in 0..samples {
            scheduler.select_mutator(&mut rng);
        }

        let stats = scheduler.report_stats();
        let tolerance = 0.02;

        for entry in stats {
            let diff = (entry.observed_frequency - entry.configured_frequency).abs();
            assert!(
                diff < tolerance,
                "Mutator {} frequency diff {} exceeds tolerance {}",
                entry.name,
                diff,
                tolerance
            );
        }
    }

    #[test]
    fn update_weight_works() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
            (Box::new(MockMutator("b")), 1.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();

        scheduler.update_weight(0, 9.0).unwrap();
        assert_eq!(scheduler.total_weight, 10.0);
        assert_eq!(scheduler.cumulative_weights, vec![9.0, 10.0]);
    }
}
