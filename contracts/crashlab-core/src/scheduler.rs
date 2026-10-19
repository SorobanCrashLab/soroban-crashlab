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
use crate::seed_novelty::SeedEnergy;

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

/// A strategy for selecting a [`CaseSeed`] from the corpus based on energy.
///
/// Implementations receive the current per-seed energy scores and return the
/// index of the seed to mutate. This lets the scheduler convert CPU into
/// depth by prioritising seeds that reach new coverage.
pub trait SeedSelector: Send + Sync {
    /// Selects a seed index from `energies` using `rng_state` for entropy.
    fn select_seed(&self, energies: &[SeedEnergy], rng_state: &mut u64) -> usize;
}

/// Statistics for a single mutator's lifecycle within a [`WeightedScheduler`].
#[derive(Debug, Clone, Default)]
pub struct MutatorStats {
    /// Total number of times this mutator was selected.
    pub selection_count: u64,
    /// Sum of energy scores observed for seeds produced by this mutator.
    pub energy_contribution: f64,
    /// Applications that decoded into a valid ScVal.
    pub decode_success_count: u64,
    /// Applications that reached the contract instead of failing in decode.
    pub contract_reached_count: u64,
    /// Number of selections that produced a novel signature (yield).
    pub novelty_count: u64,
}

/// Configurable scheduler that selects mutators based on relative weights.
pub struct WeightedScheduler {
    mutators: Vec<Box<dyn Mutator>>,
    weights: Vec<f64>,
    cumulative_weights: Vec<f64>,
    total_weight: f64,
    stats: Vec<MutatorStats>,
    total_selections: u64,
    /// Per-mutator energy feedback used to bias selection weights.
    energy_bias: Vec<f64>,
    /// Decay factor applied to accumulated energy each selection round.
    energy_decay: f64,
    /// Optional per-mutator weight snapshots for plateau-driven diversification.
    baseline_weights: Vec<f64>,
    dead_mutator_threshold: Option<u64>,
    demotion_factor: f64,
    demoted: Vec<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchedulerError {
    /// Initialised with an empty list of mutators.
    EmptyMutatorSet,
    /// All provided weights were zero. At least one non-zero weight is required.
    InvalidWeightConfiguration,
    /// Referenced a mutator index or identifier that does not exist.
    MutatorNotFound,
    /// Weight is NaN or infinite.
    InvalidWeight,
    /// Energy decay factor is outside the (0, 1] range.
    InvalidEnergyDecay,
}

impl std::fmt::Display for SchedulerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchedulerError::EmptyMutatorSet => write!(f, "empty mutator set"),
            SchedulerError::InvalidWeightConfiguration => {
                write!(f, "invalid weight configuration: all weights are zero")
            }
            SchedulerError::MutatorNotFound => write!(f, "mutator not found"),
            SchedulerError::InvalidWeight => write!(f, "invalid weight: NaN or infinite"),
            SchedulerError::InvalidEnergyDecay => {
                write!(f, "invalid energy decay: must be in (0, 1]")
            }
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
            if !weight.is_finite() {
                return Err(SchedulerError::InvalidWeight);
            }
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
        let baseline_weights = weights.clone();
        let demoted = vec![false; mutators.len()];

        Ok(Self {
            mutators,
            weights,
            cumulative_weights,
            total_weight,
            stats,
            total_selections: 0,
            energy_bias: vec![0.0; mutators.len()],
            energy_decay: 0.95,
            baseline_weights,
            dead_mutator_threshold: None,
            demotion_factor: 0.05,
            demoted,
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
        if let Some(threshold) = self.dead_mutator_threshold {
            if !self.demoted[index]
                && self.stats[index].selection_count >= threshold
                && self.stats[index].novelty_count == 0
            {
                self.demoted[index] = true;
                self.weights[index] = self.baseline_weights[index] * self.demotion_factor;
                self.recompute_cumulative();
            }
        }

        &*self.mutators[index]
    }

    /// Sets the decay factor applied to accumulated energy bias each round.
    ///
    /// A value in `(0, 1]` keeps exploration alive by shrinking stale energy.
    pub fn set_energy_decay(&mut self, decay: f64) -> Result<(), SchedulerError> {
        if !decay.is_finite() || decay <= 0.0 || decay > 1.0 {
            return Err(SchedulerError::InvalidEnergyDecay);
        }
        self.energy_decay = decay;
        Ok(())
    }

    /// Records energy feedback for the mutator at `index`.
    ///
    /// The energy is accumulated into a per-mutator bias and folded into the
    /// selection weights so that productive mutators are favoured. Old energy
    /// is decayed to keep the scheduler exploring.
    pub fn record_energy(&mut self, index: usize, energy: f64) -> Result<(), SchedulerError> {
        if index >= self.mutators.len() {
            return Err(SchedulerError::MutatorNotFound);
        }
        if !energy.is_finite() {
            return Err(SchedulerError::InvalidWeight);
        }

        let e = if energy < 0.0 { 0.0 } else { energy };
        self.stats[index].energy_contribution += e;
        self.energy_bias[index] = self.energy_bias[index] * self.energy_decay + e;

        // Blend base weight with energy bias; keep a floor so no arm starves.
        let blended = self.weights[index] + self.energy_bias[index];
        self.recompute_weights(index, blended)
    }

    /// Returns the current energy bias for each mutator, in registration order.
    pub fn energy_biases(&self) -> &[f64] {
        &self.energy_bias
    }

    /// Recomputes the cumulative distribution after updating a single weight.
    fn recompute_weights(&mut self, index: usize, new_weight: f64) -> Result<(), SchedulerError> {
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

    /// Records that the mutator at `index` produced a novel signature.
    ///
    /// Used by the plateau detector to compute per-mutator yield over a
    /// rolling window. Out-of-range indices are ignored.
    pub fn record_novelty(&mut self, index: usize) {
        if let Some(stat) = self.stats.get_mut(index) {
            stat.novelty_count += 1;
        }
        if self.demoted.get(index).copied().unwrap_or(false) {
            self.demoted[index] = false;
            self.weights[index] = self.baseline_weights[index];
            self.recompute_cumulative();
        }
    }

    /// Records a successful ScVal decode for the selected mutator.
    pub fn record_decode_success(&mut self, index: usize) {
        if let Some(stat) = self.stats.get_mut(index) {
            stat.decode_success_count += 1;
        }
    }

    /// Records that a generated value reached contract execution.
    pub fn record_contract_reached(&mut self, index: usize) {
        if let Some(stat) = self.stats.get_mut(index) {
            stat.contract_reached_count += 1;
        }
    }

    /// Enable a reversible dead-mutator policy. After `threshold` selections
    /// with no novel signature, a mutator remains in rotation at a small rate;
    /// a later yield restores its configured weight.
    pub fn set_dead_mutator_policy(&mut self, threshold: u64, demotion_factor: f64) {
        self.dead_mutator_threshold = (threshold > 0).then_some(threshold);
        self.demotion_factor = if demotion_factor.is_finite() {
            demotion_factor.clamp(0.01, 1.0)
        } else {
            0.05
        };
    }

    fn recompute_cumulative(&mut self) {
        self.cumulative_weights.clear();
        let mut sum = 0.0;
        for weight in self.weights.iter().copied() {
            sum += weight;
            self.cumulative_weights.push(sum);
        }
        self.total_weight = sum;
    }

    /// Returns the number of registered mutators.
    pub fn len(&self) -> usize {
        self.mutators.len()
    }

    /// Updates the weight of a mutator by index.
    ///
    /// Recomputes the cumulative distribution.
    pub fn update_weight(&mut self, index: usize, new_weight: f64) -> Result<(), SchedulerError> {
        if index >= self.weights.len() {
            return Err(SchedulerError::MutatorNotFound);
        }

        if !new_weight.is_finite() {
            return Err(SchedulerError::InvalidWeight);
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

    /// Forces a diversification of the mutator mix in response to a sustained
    /// plateau. Zero-yield mutators are down-weighted while the remaining mass
    /// is redistributed evenly, guaranteeing a different mix than the baseline.
    ///
    /// Returns `true` if the mix was changed, `false` if no diversification was
    /// possible (e.g. a single mutator).
    pub fn diversify(&mut self) -> bool {
        if self.mutators.len() < 2 {
            return false;
        }

        let n = self.mutators.len();
        // Rank mutators by observed yield; give more mass to higher-yield ones.
        let mut order: Vec<usize> = (0..n).collect();
        order.sort_by(|&a, &b| {
            let ya = self.stats[a].novelty_count;
            let yb = self.stats[b].novelty_count;
            yb.cmp(&ya).then(a.cmp(&b))
        });

        // Assign linearly decreasing weights across the ranked order so the
        // resulting distribution differs from the configured baseline.
        let mut new_weights = vec![0.0f64; n];
        let mut total = 0.0f64;
        for (rank, &idx) in order.iter().enumerate() {
            let w = (n - rank) as f64;
            new_weights[idx] = w;
            total += w;
        }

        if total <= 0.0 {
            return false;
        }

        for (i, w) in new_weights.into_iter().enumerate() {
            self.weights[i] = w;
        }
        self.recompute_cumulative();
        true
    }

    /// Restores the weights captured at construction time.
    pub fn reset_weights(&mut self) {
        self.weights = self.baseline_weights.clone();
        self.demoted.fill(false);
        self.recompute_cumulative();
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
                    applications: count,
                    decode_success_count: self.stats[i].decode_success_count,
                    contract_reached_count: self.stats[i].contract_reached_count,
                    observed_frequency,
                    configured_frequency,
                    energy_contribution: self.stats[i].energy_contribution,
                    novelty_count: self.stats[i].novelty_count,
                    demoted: self.demoted[i],
                }
            })
            .collect()
    }

    /// Creates a [`WeightedScheduler`] pre-configured with the default mutator set.
    pub fn default_scheduler() -> Result<Self, SchedulerError> {
        MutatorRegistry::default_registry().build()
    }
}

/// A registry for configuring, discovering, and assembling mutators.
pub struct MutatorRegistry {
    entries: Vec<(Box<dyn Mutator>, f64)>,
}

impl Default for MutatorRegistry {
    fn default() -> Self {
        Self::default_registry()
    }
}

impl MutatorRegistry {
    /// Creates an empty mutator registry.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Registers a boxed mutator with the given weight.
    pub fn register(&mut self, mutator: Box<dyn Mutator>, weight: f64) -> &mut Self {
        self.entries.push((mutator, weight));
        self
    }

    /// Registers a mutator by value with the given weight.
    pub fn register_mutator<M: Mutator + 'static>(&mut self, mutator: M, weight: f64) -> &mut Self {
        self.register(Box::new(mutator), weight)
    }

    /// Number of registered mutators.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the registry contains no mutators.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Read-only access to the registered (mutator, weight) pairs.
    pub fn entries(&self) -> &[(Box<dyn Mutator>, f64)] {
        &self.entries
    }

    /// Builds a [`WeightedScheduler`] from the registered mutators.
    pub fn build(self) -> Result<WeightedScheduler, SchedulerError> {
        WeightedScheduler::new(self.entries)
    }

    /// Returns a pre-configured default registry containing the core mutators:
    /// - [`DefaultMutator`][crate::DefaultMutator] (havoc mutator)
    /// - [`EnumVariantFlipMutator`][crate::enum_flip::EnumVariantFlipMutator]
    /// - [`PrngMutator`][crate::prng::PrngMutator]
    /// - [`BoundaryMutator`][crate::boundary::BoundaryMutator]
    /// - [`ContainerStressMutator`][crate::container_stress::ContainerStressMutator]
    /// - [`DecimalPrecisionMutator`][crate::decimal_precision::DecimalPrecisionMutator]
    pub fn default_registry() -> Self {
        let mut registry = Self::new();
        registry.register(Box::new(crate::DefaultMutator::default()), 40.0);
        registry.register(Box::new(crate::enum_flip::EnumVariantFlipMutator), 15.0);
        registry.register(Box::new(crate::prng::PrngMutator), 15.0);
        registry.register(Box::new(crate::boundary::BoundaryMutator), 10.0);
        registry.register(Box::new(crate::container_stress::ContainerStressMutator::default_mutator()), 10.0);
        registry.register(Box::new(crate::decimal_precision::DecimalPrecisionMutator), 10.0);
        registry
    }
}

/// A single entry in the scheduler's statistics report.
#[derive(Debug, Clone)]
pub struct SchedulerStatEntry {
    pub name: &'static str,
    pub weight: f64,
    pub count: u64,
    pub applications: u64,
    pub decode_success_count: u64,
    pub contract_reached_count: u64,
    pub observed_frequency: f64,
    pub configured_frequency: f64,
    pub energy_contribution: f64,
    pub novelty_count: u64,
    pub demoted: bool,
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
    fn scheduler_errors_on_nan_weight() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), f64::NAN),
            (Box::new(MockMutator("b")), 1.0),
        ];
        let result = WeightedScheduler::new(configs);
        assert_eq!(result.err(), Some(SchedulerError::InvalidWeight));
    }

    #[test]
    fn scheduler_errors_on_infinite_weight() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), f64::INFINITY),
        ];
        let result = WeightedScheduler::new(configs);
        assert_eq!(result.err(), Some(SchedulerError::InvalidWeight));
    }

    #[test]
    fn update_weight_errors_on_nan() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        let result = scheduler.update_weight(0, f64::NAN);
        assert_eq!(result.err(), Some(SchedulerError::InvalidWeight));
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

    #[test]
    fn registry_registers_and_builds() {
        let mut registry = MutatorRegistry::new();
        assert!(registry.is_empty());
        registry.register_mutator(MockMutator("a"), 5.0);
        registry.register(Box::new(MockMutator("b")), 15.0);
        assert_eq!(registry.len(), 2);
        assert!(!registry.is_empty());

        let scheduler = registry.build().unwrap();
        assert_eq!(scheduler.total_weight, 20.0);
    }

    #[test]
    fn zero_yield_mutator_is_demoted_and_a_later_yield_revives_it() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![(Box::new(MockMutator("dead")), 1.0)];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        scheduler.set_dead_mutator_policy(1, 0.05);
        let mut rng = 42;
        scheduler.select_mutator(&mut rng);
        let dead_index = scheduler
            .mutators
            .iter()
            .position(|m| m.name() == "dead")
            .unwrap();
        assert_eq!(scheduler.select_mutator(&mut rng).name(), "dead");
        assert!(scheduler.report_stats()[dead_index].demoted);
        assert!(scheduler.report_stats()[dead_index].weight > 0.0);

        scheduler.record_decode_success(dead_index);
        scheduler.record_contract_reached(dead_index);
        scheduler.record_novelty(dead_index);
        let revived = scheduler.report_stats()[dead_index].clone();
        assert!(!revived.demoted);
        assert_eq!(revived.decode_success_count, 1);
        assert_eq!(revived.contract_reached_count, 1);
        assert_eq!(revived.novelty_count, 1);
    }

    #[test]
    fn default_registry_builds_and_selects_successfully() {
        let registry = MutatorRegistry::default_registry();
        assert!(registry.len() >= 6);

        let mut scheduler = registry.build().expect("default registry builds scheduler");
        let mut rng = 42u64;
        let mut selected_names = std::collections::HashSet::new();

        for _ in 0..500 {
            let m = scheduler.select_mutator(&mut rng);
            selected_names.insert(m.name());
        }

        assert!(selected_names.contains("havoc"));
        assert!(selected_names.contains("enum-variant-flip"));
        assert!(selected_names.contains("prng"));
    }

    #[test]
    fn record_energy_biases_selection() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
            (Box::new(MockMutator("b")), 1.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        scheduler.record_energy(0, 100.0).unwrap();

        let mut rng = 7u64;
        let mut a_count = 0;
        for _ in 0..1000 {
            if scheduler.select_mutator(&mut rng).name() == "a" {
                a_count += 1;
            }
        }
        assert!(a_count > 900, "energy bias should dominate selection");
    }

    #[test]
    fn energy_decay_is_validated() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        assert_eq!(
            scheduler.set_energy_decay(0.0).err(),
            Some(SchedulerError::InvalidEnergyDecay)
        );
        assert!(scheduler.set_energy_decay(0.9).is_ok());
    }

    #[test]
    fn record_novelty_tracks_yield() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 1.0),
            (Box::new(MockMutator("b")), 1.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        scheduler.record_novelty(0);
        scheduler.record_novelty(0);
        scheduler.record_novelty(1);
        scheduler.record_novelty(99); // out of range ignored

        let stats = scheduler.report_stats();
        assert_eq!(stats[0].novelty_count, 2);
        assert_eq!(stats[1].novelty_count, 1);
    }

    #[test]
    fn diversify_changes_mix_and_reset_restores() {
        let configs: Vec<(Box<dyn Mutator>, f64)> = vec![
            (Box::new(MockMutator("a")), 10.0),
            (Box::new(MockMutator("b")), 10.0),
        ];
        let mut scheduler = WeightedScheduler::new(configs).unwrap();
        scheduler.record_novelty(1);
        assert!(scheduler.diversify());
        assert_eq!(scheduler.total_weight, 3.0);
        scheduler.reset_weights();
        assert_eq!(scheduler.total_weight, 20.0);
    }
}