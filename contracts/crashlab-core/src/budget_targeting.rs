//! Metering-edge targeting: seeds engineered at budget exhaustion boundaries (#1859).
//!
//! Budget/metering bugs - off-by-one at the limit, exhaustion mid-write leaving
//! partial state, refund accounting errors - need inputs that land *at* the
//! limit; arbitrary mutation practically never converges there. This module
//! closes the feedback loop: measure a seed's consumption ([`ConsumptionSample`]),
//! then scale loop/size knobs toward limit-minus-epsilon with deterministic
//! binary search ([`BudgetTargeter`]).
//!
//! # What lives here
//!
//! - [`MeteringLimits`] / [`ConsumptionSample`]: the budget envelope and one
//!   seed's measured usage across the cpu, memory and min-builtin dimensions -
//!   the consumption fields W5-A12 fee recording will populate.
//! - [`TargetBand`] / [`BudgetEdge`]: the +/-5% window around each limit; seeds
//!   entering the band are flagged `budget_edge` and prioritised through
//!   [`apply_budget_edge_priority`] (the energy model W5-F02 consumes).
//! - [`BudgetKnobs`] / [`BudgetTargeter`]: loop counts, vector lengths, string
//!   sizes and nesting depth exposed as mutation knobs, adjusted per dimension
//!   by binary search driven by observed consumption vs budget. The search is
//!   deterministic for a fixed PRNG seed.
//! - [`metering_dictionary`]: known limit constants (W5-F05) packaged as
//!   payload entries that feed the targeter's initial values.
//! - [`classify_exhaustion`]: exhausted seeds classified per W5-A11/W5-A12
//!   semantics - a harness sandbox kill vs the contract's own budget error.
//!
//! # Payload layout
//!
//! [`BudgetKnobs::to_payload`] writes a 21-byte payload: a `0xB7` tag byte
//! followed by loop count (u64 LE), vector length, string length and nesting
//! depth (u32 LE each). Scaling hooks that interpret these fields consume this
//! layout.

use crate::prng::SeededPrng;
use crate::CaseSeed;
use serde::{Deserialize, Serialize};

/// Host CPU instruction budget (mirrors soroban-env-host `DEFAULT_CPU_INSN_LIMIT`).
pub const DEFAULT_CPU_INSNS_LIMIT: u64 = 100_000_000;

/// Host memory budget in bytes (mirrors soroban-env-host `DEFAULT_MEM_BYTES_LIMIT`).
pub const DEFAULT_MEM_BYTES_LIMIT: u64 = 40 * 1024 * 1024;

/// Minimum builtin charge floor: the per-invocation floor of the fee model
/// (W5-A12). The host exposes no separate counter yet, so the harness defaults
/// this dimension to 1% of the CPU limit as a documented placeholder that
/// operators can override through [`MeteringLimits`].
pub const DEFAULT_MIN_BUILTIN_LIMIT: u64 = DEFAULT_CPU_INSNS_LIMIT / 100;

/// Utilization expressed in basis points where `10_000` is exactly at the limit.
pub const LIMIT_BPS: u32 = 10_000;

/// Default target band width around each limit: +/-5% (500 bps).
pub const DEFAULT_BAND_WIDTH_BPS: u32 = 500;

/// Default energy boost for `budget_edge` seeds: +20% (2_000 bps).
pub const DEFAULT_EDGE_PRIORITY_BOOST_BPS: u32 = 2_000;

/// Payload tag byte identifying a budget-targeting knob payload.
pub const BUDGET_TARGET_PAYLOAD_TAG: u8 = 0xB7;

/// One dimension of the metering budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeterDimension {
    /// Host CPU instruction budget.
    Cpu,
    /// Host memory byte budget.
    Mem,
    /// Minimum builtin charge floor of the fee model.
    MinBuiltin,
}

impl MeterDimension {
    /// All band-tracked dimensions, in stable order.
    pub const ALL: [Self; 3] = [Self::Cpu, Self::Mem, Self::MinBuiltin];

    /// Stable snake_case name for telemetry and the web API.
    pub const fn as_str(self) -> &'static str {
        match self {
            MeterDimension::Cpu => "cpu",
            MeterDimension::Mem => "mem",
            MeterDimension::MinBuiltin => "min_builtin",
        }
    }

    /// Single-byte tag used in dictionary payloads.
    pub const fn payload_tag(self) -> u8 {
        match self {
            MeterDimension::Cpu => 0,
            MeterDimension::Mem => 1,
            MeterDimension::MinBuiltin => 2,
        }
    }

    /// Inverse of [`MeterDimension::payload_tag`].
    pub fn from_payload_tag(tag: u8) -> Option<Self> {
        match tag {
            0 => Some(MeterDimension::Cpu),
            1 => Some(MeterDimension::Mem),
            2 => Some(MeterDimension::MinBuiltin),
            _ => None,
        }
    }
}

/// The metering budget envelope a campaign targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeteringLimits {
    /// CPU instruction limit.
    pub cpu_insns: u64,
    /// Memory byte limit.
    pub mem_bytes: u64,
    /// Minimum builtin charge floor limit.
    pub min_builtin: u64,
}

impl MeteringLimits {
    /// Builds a limits record from the three dimension budgets.
    pub const fn new(cpu_insns: u64, mem_bytes: u64, min_builtin: u64) -> Self {
        Self {
            cpu_insns,
            mem_bytes,
            min_builtin,
        }
    }

    /// Budget for a single dimension.
    pub const fn limit_for(self, dimension: MeterDimension) -> u64 {
        match dimension {
            MeterDimension::Cpu => self.cpu_insns,
            MeterDimension::Mem => self.mem_bytes,
            MeterDimension::MinBuiltin => self.min_builtin,
        }
    }
}

impl Default for MeteringLimits {
    /// Soroban host defaults (100M instructions, 40 MiB, 1% floor).
    fn default() -> Self {
        Self {
            cpu_insns: DEFAULT_CPU_INSNS_LIMIT,
            mem_bytes: DEFAULT_MEM_BYTES_LIMIT,
            min_builtin: DEFAULT_MIN_BUILTIN_LIMIT,
        }
    }
}

/// Measured consumption of one seed across all metering dimensions.
///
/// This is the shape W5-A12 fee/budget simulation records per seed outcome;
/// [`crate::host_runner::HostContractRunner::run_seed_with_consumption`] fills
/// it from the live host budget for real executions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ConsumptionSample {
    /// CPU instructions consumed.
    pub cpu_insns: u64,
    /// Memory bytes consumed.
    pub mem_bytes: u64,
    /// Charge accumulated by fixed builtin/setup work before contract code runs
    /// (the host resets its counters at each metered invocation, so this floor
    /// is measured before the scenario begins).
    pub min_builtin: u64,
}

impl ConsumptionSample {
    /// Consumption value for a single dimension.
    pub fn value_for(&self, dimension: MeterDimension) -> u64 {
        match dimension {
            MeterDimension::Cpu => self.cpu_insns,
            MeterDimension::Mem => self.mem_bytes,
            MeterDimension::MinBuiltin => self.min_builtin,
        }
    }

    /// Utilization of one dimension in basis points (`10_000` == at the limit).
    ///
    /// A zero limit only reports full utilization when something was consumed.
    pub fn utilization_bps(&self, limits: &MeteringLimits, dimension: MeterDimension) -> u32 {
        utilization_bps_of(self.value_for(dimension), limits.limit_for(dimension))
    }

    /// Utilization for every band-tracked dimension, in [`MeterDimension::ALL`] order.
    pub fn utilization_per_dimension(&self, limits: &MeteringLimits) -> [(MeterDimension, u32); 3] {
        [
            (
                MeterDimension::Cpu,
                self.utilization_bps(limits, MeterDimension::Cpu),
            ),
            (
                MeterDimension::Mem,
                self.utilization_bps(limits, MeterDimension::Mem),
            ),
            (
                MeterDimension::MinBuiltin,
                self.utilization_bps(limits, MeterDimension::MinBuiltin),
            ),
        ]
    }

    /// Peak utilization across dimensions in basis points.
    pub fn peak_utilization_bps(&self, limits: &MeteringLimits) -> u32 {
        self.utilization_per_dimension(limits)
            .into_iter()
            .map(|(_, utilization)| utilization)
            .max()
            .unwrap_or(0)
    }

    /// Dimension currently closest to (or past) its limit.
    pub fn peak_dimension(&self, limits: &MeteringLimits) -> MeterDimension {
        let mut best = (MeterDimension::Cpu, u32::MIN);
        for (dimension, utilization) in self.utilization_per_dimension(limits) {
            if utilization > best.1 {
                best = (dimension, utilization);
            }
        }
        best.0
    }

    /// Dimension whose utilization sits inside the target band and is closest
    /// to the limit itself, i.e. the most "on the edge" dimension.
    pub fn in_band_dimension(
        &self,
        limits: &MeteringLimits,
        band: &TargetBand,
    ) -> Option<(MeterDimension, u32)> {
        let mut best: Option<(MeterDimension, u32)> = None;
        for (dimension, utilization) in self.utilization_per_dimension(limits) {
            if band.status(utilization) != BandStatus::InBand {
                continue;
            }
            let distance = utilization.abs_diff(LIMIT_BPS);
            let better = match best {
                None => true,
                Some((_, best_utilization)) => distance < best_utilization.abs_diff(LIMIT_BPS),
            };
            if better {
                best = Some((dimension, utilization));
            }
        }
        best
    }
}

fn utilization_bps_of(value: u64, limit: u64) -> u32 {
    match limit {
        0 if value == 0 => 0,
        0 => u32::MAX,
        _ => ((value as u128 * LIMIT_BPS as u128) / limit as u128).min(u32::MAX as u128) as u32,
    }
}

/// The +/-band window around each metering limit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetBand {
    /// Half-width of the window in basis points (500 == +/-5%).
    pub width_bps: u32,
}

impl TargetBand {
    /// Builds a band of `width_bps` on each side of the limit.
    pub const fn new(width_bps: u32) -> Self {
        Self { width_bps }
    }

    /// Lower edge of the band in basis points.
    pub const fn low_bps(&self) -> u32 {
        LIMIT_BPS.saturating_sub(self.width_bps)
    }

    /// Upper edge of the band in basis points.
    pub const fn high_bps(&self) -> u32 {
        LIMIT_BPS.saturating_add(self.width_bps)
    }

    /// Classifies a utilization against this band.
    pub fn status(&self, utilization_bps: u32) -> BandStatus {
        if utilization_bps < self.low_bps() {
            BandStatus::BelowTarget
        } else if utilization_bps > self.high_bps() {
            BandStatus::AboveTarget
        } else {
            BandStatus::InBand
        }
    }
}

impl Default for TargetBand {
    fn default() -> Self {
        Self {
            width_bps: DEFAULT_BAND_WIDTH_BPS,
        }
    }
}

/// Where a utilization sits relative to the target band.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BandStatus {
    /// Usage is below the target band; knobs should grow.
    BelowTarget,
    /// Usage landed inside the +/-band window: this is the metering edge.
    InBand,
    /// Usage overshot the target band; knobs should shrink.
    AboveTarget,
}

impl BandStatus {
    /// Stable snake_case name for telemetry.
    pub const fn as_str(self) -> &'static str {
        match self {
            BandStatus::BelowTarget => "below_target",
            BandStatus::InBand => "in_band",
            BandStatus::AboveTarget => "above_target",
        }
    }
}

/// Whether a utilization has reached (or passed) the limit itself.
pub const fn is_exhausted(utilization_bps: u32) -> bool {
    utilization_bps >= LIMIT_BPS
}

/// Who hit the budget first: the fuzzer's sandbox or the contract's host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExhaustionOrigin {
    /// The fuzzer's per-seed resource sandbox killed the run (W5-A11).
    Harness,
    /// The contract's own execution hit the host budget (W5-A12).
    Contract,
}

impl ExhaustionOrigin {
    /// Stable snake_case name for telemetry.
    pub const fn as_str(self) -> &'static str {
        match self {
            ExhaustionOrigin::Harness => "harness",
            ExhaustionOrigin::Contract => "contract",
        }
    }
}

/// A classified budget exhaustion for one seed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExhaustionRecord {
    /// Who hit the budget first.
    pub origin: ExhaustionOrigin,
    /// The dimension that exhausted.
    pub dimension: MeterDimension,
    /// Utilization of the exhausted dimension in basis points.
    pub utilization_bps: u32,
}

impl ExhaustionRecord {
    /// Failure-class label: contract exhaustion is the `budget` failure class,
    /// harness kills are reported distinctly as `harness-kill`.
    pub fn category(&self) -> &'static str {
        match self.origin {
            ExhaustionOrigin::Contract => crate::taxonomy::FailureClass::Budget.as_str(),
            ExhaustionOrigin::Harness => "harness-kill",
        }
    }
}

/// Classifies an exhausted seed per W5-A11/W5-A12 semantics.
///
/// Returns `None` when no dimension reached its limit. The reported dimension
/// is the one with the highest utilization (ties resolve in
/// [`MeterDimension::ALL`] order, so the result is deterministic).
pub fn classify_exhaustion(
    origin: ExhaustionOrigin,
    sample: &ConsumptionSample,
    limits: &MeteringLimits,
) -> Option<ExhaustionRecord> {
    let mut best: Option<(MeterDimension, u32)> = None;
    for (dimension, utilization) in sample.utilization_per_dimension(limits) {
        if !is_exhausted(utilization) {
            continue;
        }
        match best {
            None => best = Some((dimension, utilization)),
            Some((_, best_utilization)) if utilization > best_utilization => {
                best = Some((dimension, utilization));
            }
            _ => {}
        }
    }
    best.map(|(dimension, utilization_bps)| ExhaustionRecord {
        origin,
        dimension,
        utilization_bps,
    })
}

/// A seed whose peak utilization landed inside the target band.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetEdge {
    /// The dimension closest to its limit inside the band.
    pub dimension: MeterDimension,
    /// Utilization of that dimension in basis points.
    pub utilization_bps: u32,
}

/// Weight multiplier applied to seeds flagged `budget_edge`.
pub fn edge_priority_multiplier(boost_bps: u32) -> f64 {
    1.0 + f64::from(boost_bps) / f64::from(LIMIT_BPS)
}

/// Boosts scheduler weights of seeds flagged `budget_edge` (W5-F02 energy).
///
/// Flagged entries are multiplied by `1 + boost_bps / 10_000`; unflagged
/// entries are left untouched, so relative ordering of the rest is preserved.
pub fn apply_budget_edge_priority(weights: &mut [f64], budget_edge: &[bool], boost_bps: u32) {
    assert_eq!(
        weights.len(),
        budget_edge.len(),
        "weights and budget_edge flags must be parallel"
    );
    let multiplier = edge_priority_multiplier(boost_bps);
    for (weight, flagged) in weights.iter_mut().zip(budget_edge.iter()) {
        if *flagged {
            *weight *= multiplier;
        }
    }
}

/// Search bounds for each knob as `(min, max)` pairs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct KnobBounds {
    /// Loop count search bounds.
    pub loop_count: (u64, u64),
    /// Vector length search bounds.
    pub vec_len: (u32, u32),
    /// String length search bounds.
    pub string_len: (u32, u32),
    /// Nesting depth search bounds.
    pub nested_depth: (u32, u32),
}

impl Default for KnobBounds {
    fn default() -> Self {
        Self {
            loop_count: (1, 1_000_000),
            vec_len: (1, 10_000),
            string_len: (1, 16_384),
            nested_depth: (1, 32),
        }
    }
}

impl KnobBounds {
    /// Returns `true` when every pair is well-formed (`min <= max`, `max > 0`).
    pub const fn is_valid(&self) -> bool {
        self.loop_count.0 <= self.loop_count.1
            && self.loop_count.1 > 0
            && self.vec_len.0 <= self.vec_len.1
            && self.vec_len.1 > 0
            && self.string_len.0 <= self.string_len.1
            && self.string_len.1 > 0
            && self.nested_depth.0 <= self.nested_depth.1
            && self.nested_depth.1 > 0
    }
}

/// Loop/size parameters exposed as mutation knobs.
///
/// The payload encoding ([`BudgetKnobs::to_payload`]) is fixed and
/// little-endian so scaling hooks (and replay tooling) can read the intended
/// loop counts, vector sizes, string sizes and nesting depth back out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetKnobs {
    /// Number of loop iterations the payload asks the contract to perform.
    pub loop_count: u64,
    /// Requested vector length.
    pub vec_len: u32,
    /// Requested string length.
    pub string_len: u32,
    /// Requested nesting depth.
    pub nested_depth: u32,
}

impl BudgetKnobs {
    /// Clamps every knob into `bounds`.
    pub fn clamped(self, bounds: &KnobBounds) -> Self {
        Self {
            loop_count: self
                .loop_count
                .clamp(bounds.loop_count.0, bounds.loop_count.1),
            vec_len: self.vec_len.clamp(bounds.vec_len.0, bounds.vec_len.1),
            string_len: self
                .string_len
                .clamp(bounds.string_len.0, bounds.string_len.1),
            nested_depth: self
                .nested_depth
                .clamp(bounds.nested_depth.0, bounds.nested_depth.1),
        }
    }

    /// Encodes the knobs as a 21-byte budget-target payload.
    pub fn to_payload(&self) -> Vec<u8> {
        let mut payload = Vec::with_capacity(21);
        payload.push(BUDGET_TARGET_PAYLOAD_TAG);
        payload.extend_from_slice(&self.loop_count.to_le_bytes());
        payload.extend_from_slice(&self.vec_len.to_le_bytes());
        payload.extend_from_slice(&self.string_len.to_le_bytes());
        payload.extend_from_slice(&self.nested_depth.to_le_bytes());
        payload
    }

    /// Decodes a payload written by [`BudgetKnobs::to_payload`].
    ///
    /// Returns `None` when the tag byte or length does not match the layout.
    pub fn from_payload(payload: &[u8]) -> Option<Self> {
        if payload.len() < 21 || payload[0] != BUDGET_TARGET_PAYLOAD_TAG {
            return None;
        }
        let mut loop_bytes = [0u8; 8];
        loop_bytes.copy_from_slice(&payload[1..9]);
        let mut word = [0u8; 4];
        word.copy_from_slice(&payload[9..13]);
        let vec_len = u32::from_le_bytes(word);
        word.copy_from_slice(&payload[13..17]);
        let string_len = u32::from_le_bytes(word);
        word.copy_from_slice(&payload[17..21]);
        let nested_depth = u32::from_le_bytes(word);
        Some(Self {
            loop_count: u64::from_le_bytes(loop_bytes),
            vec_len,
            string_len,
            nested_depth,
        })
    }

    /// Wraps the knobs as a fuzz seed carrying the budget-target payload.
    pub fn to_seed(self, id: u64) -> CaseSeed {
        CaseSeed {
            id,
            payload: self.to_payload(),
        }
    }
}

/// A known limit constant packaged as an initial-value seed entry (W5-F05).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DictionaryEntry {
    /// Stable label, e.g. `cpu_band_low`.
    pub label: &'static str,
    /// Dimension the constant belongs to.
    pub dimension: MeterDimension,
    /// The constant itself, in the dimension's native unit.
    pub value: u64,
    /// Ready-to-fuzz payload embedding the constant.
    pub payload: Vec<u8>,
}

const DICTIONARY_LABELS: [(MeterDimension, [&'static str; 4]); 3] = [
    (
        MeterDimension::Cpu,
        [
            "cpu_limit",
            "cpu_limit_minus_one",
            "cpu_band_low",
            "cpu_band_high",
        ],
    ),
    (
        MeterDimension::Mem,
        [
            "mem_limit",
            "mem_limit_minus_one",
            "mem_band_low",
            "mem_band_high",
        ],
    ),
    (
        MeterDimension::MinBuiltin,
        [
            "min_builtin_limit",
            "min_builtin_limit_minus_one",
            "min_builtin_band_low",
            "min_builtin_band_high",
        ],
    ),
];

/// Known limit constants and their band edges as dictionary entries (W5-F05).
///
/// The entries feed initial targeter values: scaling the band entries into
/// knob space starts the search near the edge instead of at a midpoint.
pub fn metering_dictionary(limits: &MeteringLimits) -> Vec<DictionaryEntry> {
    let band = TargetBand::default();
    let mut entries = Vec::new();
    for (dimension, labels) in DICTIONARY_LABELS {
        let limit = limits.limit_for(dimension);
        let values = [
            limit,
            limit.saturating_sub(1),
            scale_to_bps(limit, band.low_bps()),
            scale_to_bps(limit, band.high_bps()),
        ];
        for (label, value) in labels.into_iter().zip(values) {
            let mut payload = Vec::with_capacity(10);
            payload.push(BUDGET_TARGET_PAYLOAD_TAG);
            payload.push(dimension.payload_tag());
            payload.extend_from_slice(&value.to_le_bytes());
            entries.push(DictionaryEntry {
                label,
                dimension,
                value,
                payload,
            });
        }
    }
    entries
}

fn scale_to_bps(value: u64, bps: u32) -> u64 {
    ((value as u128 * bps as u128) / LIMIT_BPS as u128) as u64
}

/// Maps a dictionary entry's limit-space value into starting knob values.
///
/// The entry's own dimension is seeded proportionally to `value / limit`
/// (clamped into its bounds); the remaining knobs start at their midpoints.
pub fn initial_knobs_from_dictionary(
    entry: &DictionaryEntry,
    config: &BudgetTargetConfig,
) -> BudgetKnobs {
    let (lo, hi) = knob_bounds_pair(&config.bounds, KnobAxis::from_dimension(entry.dimension));
    let limit = config.limits.limit_for(entry.dimension);
    let scaled = if limit == 0 {
        hi
    } else {
        lo.saturating_add(
            (hi.saturating_sub(lo) as u128 * entry.value as u128 / limit as u128) as u64,
        )
        .min(hi)
    };
    let mut knobs = BudgetKnobs {
        loop_count: midpoint(config.bounds.loop_count),
        vec_len: midpoint_u32(config.bounds.vec_len),
        string_len: midpoint_u32(config.bounds.string_len),
        nested_depth: midpoint_u32(config.bounds.nested_depth),
    };
    match KnobAxis::from_dimension(entry.dimension) {
        KnobAxis::LoopCount => knobs.loop_count = scaled,
        KnobAxis::VecLen => knobs.vec_len = scaled as u32,
        KnobAxis::StringLen => knobs.string_len = scaled as u32,
        KnobAxis::NestedDepth => knobs.nested_depth = scaled as u32,
    }
    knobs.clamped(&config.bounds)
}

/// Per-preset metering-edge targeting policy (#1859).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetTargetPolicy {
    /// Target band half-width in basis points (issue mandate: 500 == +/-5%).
    pub band_width_bps: u32,
    /// Maximum binary-search observations before the search is capped.
    pub max_iterations: u32,
    /// Energy boost in basis points for seeds flagged `budget_edge`.
    pub edge_priority_boost_bps: u32,
}

/// Configuration for a budget-targeting search.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetTargetConfig {
    /// Budget envelope being targeted.
    pub limits: MeteringLimits,
    /// Target window around each limit.
    pub band: TargetBand,
    /// Search bounds per knob.
    pub bounds: KnobBounds,
    /// Hard cap on search observations.
    pub max_iterations: u32,
}

impl BudgetTargetConfig {
    /// Builds a config from a per-preset [`BudgetTargetPolicy`], keeping the
    /// default limits and knob bounds.
    pub fn from_policy(policy: &BudgetTargetPolicy) -> Self {
        Self {
            limits: MeteringLimits::default(),
            band: TargetBand::new(policy.band_width_bps),
            bounds: KnobBounds::default(),
            max_iterations: policy.max_iterations,
        }
    }

    /// Returns `true` when the config is well-formed.
    pub fn is_valid(&self) -> bool {
        self.bounds.is_valid() && self.band.width_bps <= LIMIT_BPS && self.max_iterations > 0
    }
}

impl Default for BudgetTargetConfig {
    fn default() -> Self {
        Self {
            limits: MeteringLimits::default(),
            band: TargetBand::default(),
            bounds: KnobBounds::default(),
            max_iterations: 32,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KnobAxis {
    LoopCount,
    VecLen,
    StringLen,
    NestedDepth,
}

const KNOB_AXES: [KnobAxis; 4] = [
    KnobAxis::LoopCount,
    KnobAxis::VecLen,
    KnobAxis::StringLen,
    KnobAxis::NestedDepth,
];

impl KnobAxis {
    fn from_dimension(dimension: MeterDimension) -> Self {
        match dimension {
            MeterDimension::Cpu => KnobAxis::LoopCount,
            MeterDimension::Mem => KnobAxis::VecLen,
            MeterDimension::MinBuiltin => KnobAxis::StringLen,
        }
    }
}

fn knob_bounds_pair(bounds: &KnobBounds, axis: KnobAxis) -> (u64, u64) {
    match axis {
        KnobAxis::LoopCount => bounds.loop_count,
        KnobAxis::VecLen => (bounds.vec_len.0 as u64, bounds.vec_len.1 as u64),
        KnobAxis::StringLen => (bounds.string_len.0 as u64, bounds.string_len.1 as u64),
        KnobAxis::NestedDepth => (bounds.nested_depth.0 as u64, bounds.nested_depth.1 as u64),
    }
}

fn set_knob_bounds_pair(bounds: &mut KnobBounds, axis: KnobAxis, lo: u64, hi: u64) {
    match axis {
        KnobAxis::LoopCount => bounds.loop_count = (lo, hi),
        KnobAxis::VecLen => bounds.vec_len = (lo as u32, hi as u32),
        KnobAxis::StringLen => bounds.string_len = (lo as u32, hi as u32),
        KnobAxis::NestedDepth => bounds.nested_depth = (lo as u32, hi as u32),
    }
}

fn get_knob(knobs: &BudgetKnobs, axis: KnobAxis) -> u64 {
    match axis {
        KnobAxis::LoopCount => knobs.loop_count,
        KnobAxis::VecLen => knobs.vec_len as u64,
        KnobAxis::StringLen => knobs.string_len as u64,
        KnobAxis::NestedDepth => knobs.nested_depth as u64,
    }
}

fn set_knob(knobs: &mut BudgetKnobs, axis: KnobAxis, value: u64) {
    match axis {
        KnobAxis::LoopCount => knobs.loop_count = value,
        KnobAxis::VecLen => knobs.vec_len = value as u32,
        KnobAxis::StringLen => knobs.string_len = value as u32,
        KnobAxis::NestedDepth => knobs.nested_depth = value as u32,
    }
}

fn midpoint(pair: (u64, u64)) -> u64 {
    pair.0 + (pair.1 - pair.0) / 2
}

fn midpoint_u32(pair: (u32, u32)) -> u32 {
    pair.0 + (pair.1 - pair.0) / 2
}

/// Deterministic binary-search driver toward the metering edge.
///
/// The caller executes [`BudgetTargeter::current_seed`], measures the outcome
/// as a [`ConsumptionSample`], and feeds it back through [`BudgetTargeter::observe`].
/// Each observation shrinks every knob's search range toward its own
/// dimension's target band (and shrinks the nesting-depth knob toward the peak
/// signal); once any dimension lands inside the band the seed is flagged
/// `budget_edge` and the search freezes.
///
/// The whole trajectory is a pure function of `(config, rng seed, observed
/// samples)`, so replays converge identically.
#[derive(Debug, Clone)]
pub struct BudgetTargeter {
    config: BudgetTargetConfig,
    ranges: KnobBounds,
    knobs: BudgetKnobs,
    rng: SeededPrng,
    iterations: u32,
    last_status: Option<BandStatus>,
    budget_edge: Option<BudgetEdge>,
    stalled: bool,
    nudged: bool,
    best_distance: u32,
    best_utilization_bps: u32,
    best_knobs: BudgetKnobs,
}

impl BudgetTargeter {
    /// Creates a search starting from the midpoint of every knob range.
    pub fn new(config: BudgetTargetConfig, rng_seed: u64) -> Self {
        let knobs = BudgetKnobs {
            loop_count: midpoint(config.bounds.loop_count),
            vec_len: midpoint_u32(config.bounds.vec_len),
            string_len: midpoint_u32(config.bounds.string_len),
            nested_depth: midpoint_u32(config.bounds.nested_depth),
        };
        let ranges = config.bounds;
        Self {
            config,
            ranges,
            knobs,
            rng: SeededPrng::new(rng_seed),
            iterations: 0,
            last_status: None,
            budget_edge: None,
            stalled: false,
            nudged: false,
            best_distance: u32::MAX,
            best_utilization_bps: 0,
            best_knobs: knobs,
        }
    }

    /// Creates a search whose starting knobs are seeded from a dictionary
    /// entry's limit constant (W5-F05 initial values).
    pub fn with_dictionary_seed(
        config: BudgetTargetConfig,
        rng_seed: u64,
        entry: &DictionaryEntry,
    ) -> Self {
        let mut targeter = Self::new(config, rng_seed);
        targeter.knobs = initial_knobs_from_dictionary(entry, &targeter.config);
        targeter.best_knobs = targeter.knobs;
        targeter
    }

    /// The active configuration.
    pub fn config(&self) -> &BudgetTargetConfig {
        &self.config
    }

    /// The knobs the next seed should be built from.
    pub fn knobs(&self) -> &BudgetKnobs {
        &self.knobs
    }

    /// Seeds carrying the current knob payload.
    pub fn current_seed(&self, id: u64) -> CaseSeed {
        self.knobs.to_seed(id)
    }

    /// Observations consumed so far (capped observations are not counted).
    pub fn iterations(&self) -> u32 {
        self.iterations
    }

    /// The `budget_edge` flag once some dimension entered the band.
    pub fn budget_edge(&self) -> Option<&BudgetEdge> {
        self.budget_edge.as_ref()
    }

    /// Whether a dimension reached the target band.
    pub fn is_converged(&self) -> bool {
        self.budget_edge.is_some()
    }

    /// Whether the search exhausted every knob range without reaching the band.
    pub fn is_stalled(&self) -> bool {
        self.stalled
    }

    /// Whether the observation cap stopped the search.
    pub fn is_capped(&self) -> bool {
        self.iterations >= self.config.max_iterations
    }

    /// Status reported by the most recent observation.
    pub fn last_status(&self) -> Option<BandStatus> {
        self.last_status
    }

    /// Utilization closest to the limit seen so far.
    pub fn best_utilization_bps(&self) -> u32 {
        self.best_utilization_bps
    }

    /// Knobs that produced [`BudgetTargeter::best_utilization_bps`].
    pub fn best_knobs(&self) -> &BudgetKnobs {
        &self.best_knobs
    }

    /// Feeds back the measurement of the current knobs.
    ///
    /// Returns [`BandStatus::InBand`] exactly when a `budget_edge` flag is set.
    pub fn observe(&mut self, sample: &ConsumptionSample) -> BandStatus {
        if self.is_converged() {
            // The edge is locked in: later observations are recorded nowhere
            // and the frozen `InBand` verdict stands.
            return BandStatus::InBand;
        }
        let limits = self.config.limits;
        let band = self.config.band;
        let peak = sample.peak_utilization_bps(&limits);
        let status = band.status(peak);

        let distance = peak.abs_diff(LIMIT_BPS);
        if distance < self.best_distance {
            self.best_distance = distance;
            self.best_utilization_bps = peak;
            self.best_knobs = self.knobs;
        }

        let terminal =
            self.is_converged() || self.stalled || self.iterations >= self.config.max_iterations;
        if !terminal {
            self.iterations += 1;
        }

        if let Some((dimension, utilization_bps)) = sample.in_band_dimension(&limits, &band) {
            if self.budget_edge.is_none() {
                self.budget_edge = Some(BudgetEdge {
                    dimension,
                    utilization_bps,
                });
            }
            self.last_status = Some(BandStatus::InBand);
            return BandStatus::InBand;
        }
        if terminal {
            self.last_status = Some(status);
            return status;
        }

        let mut moved = false;
        for axis in KNOB_AXES {
            let axis_status = if axis == KnobAxis::NestedDepth {
                status
            } else {
                let dimension = match axis {
                    KnobAxis::LoopCount => MeterDimension::Cpu,
                    KnobAxis::VecLen => MeterDimension::Mem,
                    _ => MeterDimension::MinBuiltin,
                };
                band.status(sample.utilization_bps(&limits, dimension))
            };
            moved |= self.adjust_axis(axis, axis_status);
        }
        if !moved {
            self.stall_or_nudge();
        }

        self.last_status = Some(status);
        status
    }

    fn adjust_axis(&mut self, axis: KnobAxis, status: BandStatus) -> bool {
        let (lo, hi) = knob_bounds_pair(&self.ranges, axis);
        let current = get_knob(&self.knobs, axis);
        match status {
            BandStatus::InBand => false,
            BandStatus::BelowTarget => {
                let new_lo = current.saturating_add(1).max(lo);
                if new_lo > hi {
                    return false;
                }
                set_knob_bounds_pair(&mut self.ranges, axis, new_lo, hi);
                set_knob(&mut self.knobs, axis, midpoint((new_lo, hi)));
                true
            }
            BandStatus::AboveTarget => {
                if current <= lo {
                    return false;
                }
                let new_hi = hi.min(current - 1);
                set_knob_bounds_pair(&mut self.ranges, axis, lo, new_hi);
                set_knob(&mut self.knobs, axis, midpoint((lo, new_hi)));
                true
            }
        }
    }

    fn stall_or_nudge(&mut self) {
        if self.nudged || !self.nudge_within_ranges() {
            self.stalled = true;
        } else {
            self.nudged = true;
        }
    }

    fn nudge_within_ranges(&mut self) -> bool {
        let start = (self.rng.next_u64() as usize) % KNOB_AXES.len();
        let first_up = self.rng.next_u64() % 2 == 0;
        for &up in &[first_up, !first_up] {
            for offset in 0..KNOB_AXES.len() {
                let axis = KNOB_AXES[(start + offset) % KNOB_AXES.len()];
                let (lo, hi) = knob_bounds_pair(&self.ranges, axis);
                let current = get_knob(&self.knobs, axis);
                let next = if up {
                    current.saturating_add(1)
                } else {
                    current.saturating_sub(1)
                };
                if next != current && next >= lo && next <= hi {
                    set_knob(&mut self.knobs, axis, next);
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct SyntheticMeter {
        cpu_per_loop: u64,
        mem_per_vec: u64,
        builtin_per_char: u64,
    }

    const LINEAR: SyntheticMeter = SyntheticMeter {
        cpu_per_loop: 100,
        mem_per_vec: 4_194,
        builtin_per_char: 61,
    };

    const STEEP: SyntheticMeter = SyntheticMeter {
        cpu_per_loop: 300,
        mem_per_vec: 12_583,
        builtin_per_char: 183,
    };

    impl SyntheticMeter {
        fn sample(&self, knobs: &BudgetKnobs) -> ConsumptionSample {
            ConsumptionSample {
                cpu_insns: knobs.loop_count.saturating_mul(self.cpu_per_loop),
                mem_bytes: (knobs.vec_len as u64).saturating_mul(self.mem_per_vec),
                min_builtin: (knobs.string_len as u64).saturating_mul(self.builtin_per_char),
            }
        }
    }

    fn run_to_termination(
        targeter: &mut BudgetTargeter,
        meter: &SyntheticMeter,
        max_observations: u32,
    ) -> BandStatus {
        let mut status = BandStatus::BelowTarget;
        for _ in 0..max_observations {
            if targeter.is_converged() || targeter.is_stalled() || targeter.is_capped() {
                break;
            }
            status = targeter.observe(&meter.sample(targeter.knobs()));
        }
        status
    }

    #[test]
    fn default_limits_match_host_budget_defaults() {
        let limits = MeteringLimits::default();
        assert_eq!(limits.cpu_insns, 100_000_000);
        assert_eq!(limits.mem_bytes, 40 * 1024 * 1024);
        assert_eq!(limits.min_builtin, 1_000_000);
        assert_eq!(limits.limit_for(MeterDimension::Cpu), limits.cpu_insns);
        assert_eq!(limits.limit_for(MeterDimension::Mem), limits.mem_bytes);
        assert_eq!(
            limits.limit_for(MeterDimension::MinBuiltin),
            limits.min_builtin
        );
    }

    #[test]
    fn utilization_scales_against_each_limit() {
        let limits = MeteringLimits::default();
        let sample = ConsumptionSample {
            cpu_insns: 50_000_000,
            mem_bytes: 41_943_040,
            min_builtin: 1_050_000,
        };
        assert_eq!(sample.utilization_bps(&limits, MeterDimension::Cpu), 5_000);
        assert_eq!(sample.utilization_bps(&limits, MeterDimension::Mem), 10_000);
        assert_eq!(
            sample.utilization_bps(&limits, MeterDimension::MinBuiltin),
            10_500
        );
        assert_eq!(sample.peak_utilization_bps(&limits), 10_500);
        assert_eq!(sample.peak_dimension(&limits), MeterDimension::MinBuiltin);
    }

    #[test]
    fn utilization_handles_zero_limits() {
        let limits = MeteringLimits::new(0, 0, 0);
        let empty = ConsumptionSample::default();
        assert_eq!(
            empty.utilization_bps(&limits, MeterDimension::Cpu),
            0,
            "zero usage against a zero limit is zero utilization"
        );
        let used = ConsumptionSample {
            cpu_insns: 1,
            ..ConsumptionSample::default()
        };
        assert_eq!(
            used.utilization_bps(&limits, MeterDimension::Cpu),
            u32::MAX,
            "usage against a zero limit is exhausted"
        );
    }

    #[test]
    fn target_band_is_five_percent_around_the_limit() {
        let band = TargetBand::default();
        assert_eq!(band.low_bps(), 9_500);
        assert_eq!(band.high_bps(), 10_500);
        assert_eq!(band.status(9_499), BandStatus::BelowTarget);
        assert_eq!(band.status(9_500), BandStatus::InBand);
        assert_eq!(band.status(10_000), BandStatus::InBand);
        assert_eq!(band.status(10_500), BandStatus::InBand);
        assert_eq!(band.status(10_501), BandStatus::AboveTarget);
        assert!(!is_exhausted(9_999));
        assert!(is_exhausted(10_000));
        assert!(is_exhausted(20_000));
    }

    #[test]
    fn knobs_payload_roundtrips() {
        let knobs = BudgetKnobs {
            loop_count: 123_456,
            vec_len: 789,
            string_len: 10_000,
            nested_depth: 5,
        };
        let payload = knobs.to_payload();
        assert_eq!(payload.len(), 21);
        assert_eq!(payload[0], BUDGET_TARGET_PAYLOAD_TAG);
        assert_eq!(BudgetKnobs::from_payload(&payload), Some(knobs));
        assert_eq!(BudgetKnobs::from_payload(&[]), None);
        let mut wrong_tag = payload.clone();
        wrong_tag[0] = 0x00;
        assert_eq!(BudgetKnobs::from_payload(&wrong_tag), None);
        assert_eq!(BudgetKnobs::from_payload(&payload[..20]), None);
    }

    #[test]
    fn knobs_clamp_into_bounds() {
        let bounds = KnobBounds::default();
        let knobs = BudgetKnobs {
            loop_count: u64::MAX,
            vec_len: 0,
            string_len: 999_999,
            nested_depth: 0,
        }
        .clamped(&bounds);
        assert_eq!(knobs.loop_count, bounds.loop_count.1);
        assert_eq!(knobs.vec_len, bounds.vec_len.0);
        assert_eq!(knobs.string_len, bounds.string_len.1);
        assert_eq!(knobs.nested_depth, bounds.nested_depth.0);
        assert!(bounds.is_valid());
        assert!(!KnobBounds {
            loop_count: (10, 1),
            ..KnobBounds::default()
        }
        .is_valid());
    }

    #[test]
    fn dictionary_covers_known_limit_constants() {
        let limits = MeteringLimits::default();
        let entries = metering_dictionary(&limits);
        assert_eq!(entries.len(), 12);
        let labels: Vec<&str> = entries.iter().map(|entry| entry.label).collect();
        for expected in [
            "cpu_limit",
            "cpu_limit_minus_one",
            "cpu_band_low",
            "cpu_band_high",
            "mem_limit",
            "min_builtin_band_low",
        ] {
            assert!(
                labels.contains(&expected),
                "missing dictionary entry {expected}"
            );
        }
        let cpu_band_low = entries
            .iter()
            .find(|entry| entry.label == "cpu_band_low")
            .expect("cpu band entry");
        assert_eq!(cpu_band_low.value, 95_000_000);
        for entry in &entries {
            assert_eq!(entry.payload[0], BUDGET_TARGET_PAYLOAD_TAG);
            assert_eq!(
                MeterDimension::from_payload_tag(entry.payload[1]),
                Some(entry.dimension)
            );
            let mut value_bytes = [0u8; 8];
            value_bytes.copy_from_slice(&entry.payload[2..10]);
            assert_eq!(u64::from_le_bytes(value_bytes), entry.value);
            let limit = limits.limit_for(entry.dimension);
            assert!(
                entry.value <= scale_to_bps(limit, 10_500),
                "{} exceeds the band high edge",
                entry.label
            );
        }
    }

    #[test]
    fn dictionary_seed_feeds_initial_knobs() {
        let config = BudgetTargetConfig::default();
        let entry = metering_dictionary(&config.limits)
            .into_iter()
            .find(|entry| entry.label == "cpu_band_low")
            .expect("cpu band entry");
        let knobs = initial_knobs_from_dictionary(&entry, &config);
        assert_eq!(knobs.loop_count, 950_000);
        assert_eq!(knobs.vec_len, midpoint_u32(config.bounds.vec_len));
        assert_eq!(knobs.string_len, midpoint_u32(config.bounds.string_len));
        assert_eq!(knobs.nested_depth, midpoint_u32(config.bounds.nested_depth));
        assert!(knobs.loop_count >= config.bounds.loop_count.0);
        assert!(knobs.loop_count <= config.bounds.loop_count.1);
    }

    #[test]
    fn synthetic_payload_reaches_target_band_within_iteration_budget() {
        let config = BudgetTargetConfig::default();
        let mut targeter = BudgetTargeter::new(config.clone(), 7);
        let status = run_to_termination(&mut targeter, &LINEAR, 16);

        assert_eq!(status, BandStatus::InBand);
        assert!(targeter.is_converged());
        assert!(!targeter.is_stalled());
        assert!(targeter.iterations() <= 16, "converged in too many steps");
        let edge = targeter.budget_edge().expect("budget_edge flag");
        assert!(
            edge.utilization_bps >= 9_500 && edge.utilization_bps <= 10_500,
            "edge utilization {} outside the band",
            edge.utilization_bps
        );
        let limits = config.limits;
        let peak = LINEAR
            .sample(targeter.knobs())
            .peak_utilization_bps(&limits);
        assert!(peak >= 9_500 && peak <= 10_500);
        let bounds = config.bounds;
        let knobs = *targeter.knobs();
        assert!(knobs.loop_count >= bounds.loop_count.0);
        assert!(knobs.loop_count <= bounds.loop_count.1);
        assert!(knobs.vec_len <= bounds.vec_len.1);
        assert!(knobs.string_len <= bounds.string_len.1);
        assert!(knobs.nested_depth <= bounds.nested_depth.1);
    }

    #[test]
    fn overshooting_search_descends_back_into_the_band() {
        let config = BudgetTargetConfig::default();
        let mut targeter = BudgetTargeter::new(config, 11);
        let first = targeter.observe(&STEEP.sample(targeter.knobs()));
        assert_eq!(first, BandStatus::AboveTarget, "steep model must overshoot");
        let status = run_to_termination(&mut targeter, &STEEP, 16);
        assert_eq!(status, BandStatus::InBand);
        assert!(targeter.is_converged());
        assert!(targeter.iterations() <= 16);
    }

    #[test]
    fn search_is_deterministic_for_the_same_rng_seed() {
        let config = BudgetTargetConfig::default();
        let mut first = BudgetTargeter::new(config.clone(), 42);
        let mut second = BudgetTargeter::new(config, 42);
        let mut first_trace = Vec::new();
        let mut second_trace = Vec::new();
        for _ in 0..16 {
            first_trace.push(*first.knobs());
            first.observe(&LINEAR.sample(first.knobs()));
            second_trace.push(*second.knobs());
            second.observe(&LINEAR.sample(second.knobs()));
        }
        assert_eq!(first_trace, second_trace);
        assert_eq!(first.iterations(), second.iterations());
        assert_eq!(first.budget_edge(), second.budget_edge());
    }

    #[test]
    fn dictionary_seeded_search_converges_on_the_first_observation() {
        let config = BudgetTargetConfig::default();
        let entry = metering_dictionary(&config.limits)
            .into_iter()
            .find(|entry| entry.label == "cpu_band_low")
            .expect("cpu band entry");
        let mut targeter = BudgetTargeter::with_dictionary_seed(config, 5, &entry);
        assert_eq!(targeter.knobs().loop_count, 950_000);
        let status = targeter.observe(&LINEAR.sample(targeter.knobs()));
        assert_eq!(status, BandStatus::InBand);
        assert_eq!(targeter.iterations(), 1);
        assert_eq!(
            targeter.budget_edge().map(|edge| edge.dimension),
            Some(MeterDimension::Cpu)
        );
        assert_eq!(
            targeter.budget_edge().map(|edge| edge.utilization_bps),
            Some(9_500)
        );
    }

    #[test]
    fn unreachable_band_stalls_deterministically() {
        let config = BudgetTargetConfig {
            limits: MeteringLimits::new(1_000_000_000_000, 1_000_000_000_000, 1_000_000_000_000),
            ..BudgetTargetConfig::default()
        };
        let mut targeter = BudgetTargeter::new(config, 3);
        run_to_termination(&mut targeter, &LINEAR, 100);

        assert!(targeter.is_stalled(), "search should exhaust its ranges");
        assert!(!targeter.is_converged());
        assert!(targeter.budget_edge().is_none());
        assert!(targeter.iterations() < 32, "stall must respect the cap");
        assert!(targeter.best_utilization_bps() < 9_500);
    }

    #[test]
    fn observation_cap_stops_the_search() {
        let config = BudgetTargetConfig {
            limits: MeteringLimits::new(1_000_000_000_000, 1_000_000_000_000, 1_000_000_000_000),
            max_iterations: 3,
            ..BudgetTargetConfig::default()
        };
        assert!(config.is_valid());
        let mut targeter = BudgetTargeter::new(config.clone(), 9);
        for _ in 0..10 {
            targeter.observe(&LINEAR.sample(targeter.knobs()));
        }
        assert_eq!(targeter.iterations(), 3);
        assert!(targeter.is_capped());
        assert!(!targeter.is_stalled());
        assert!(!targeter.is_converged());
    }

    #[test]
    fn converged_search_freezes_on_later_observations() {
        let config = BudgetTargetConfig::default();
        let mut targeter = BudgetTargeter::new(config, 7);
        run_to_termination(&mut targeter, &LINEAR, 16);
        let edge = *targeter.budget_edge().expect("converged");
        let iterations = targeter.iterations();
        let knobs = *targeter.knobs();

        let sample = ConsumptionSample {
            cpu_insns: 1,
            mem_bytes: 1,
            min_builtin: 1,
        };
        let status = targeter.observe(&sample);
        assert_eq!(status, BandStatus::InBand);
        assert_eq!(targeter.budget_edge(), Some(&edge));
        assert_eq!(targeter.iterations(), iterations);
        assert_eq!(targeter.knobs(), &knobs);
    }

    #[test]
    fn exhausted_seeds_classify_as_contract_vs_harness() {
        let limits = MeteringLimits::default();
        let sample = ConsumptionSample {
            cpu_insns: 100_000_000,
            mem_bytes: 41_943_040,
            min_builtin: 500_000,
        };
        let contract =
            classify_exhaustion(ExhaustionOrigin::Contract, &sample, &limits).expect("exhausted");
        assert_eq!(contract.origin, ExhaustionOrigin::Contract);
        assert_eq!(contract.dimension, MeterDimension::Cpu);
        assert_eq!(contract.utilization_bps, 10_000);
        assert_eq!(contract.category(), "budget");

        let harness_sample = ConsumptionSample {
            cpu_insns: 1,
            mem_bytes: 83_886_080,
            min_builtin: 1,
        };
        let harness = classify_exhaustion(ExhaustionOrigin::Harness, &harness_sample, &limits)
            .expect("exhausted");
        assert_eq!(harness.origin, ExhaustionOrigin::Harness);
        assert_eq!(harness.dimension, MeterDimension::Mem);
        assert_eq!(harness.utilization_bps, 20_000);
        assert_eq!(harness.category(), "harness-kill");

        let fresh = ConsumptionSample {
            cpu_insns: 1_000_000,
            mem_bytes: 1_000_000,
            min_builtin: 1_000,
        };
        assert!(classify_exhaustion(ExhaustionOrigin::Contract, &fresh, &limits).is_none());
        assert_eq!(ExhaustionOrigin::Contract.as_str(), "contract");
        assert_eq!(ExhaustionOrigin::Harness.as_str(), "harness");
    }

    #[test]
    fn budget_edge_priority_boosts_only_flagged_seeds() {
        let mut weights = vec![1.0, 2.0, 4.0];
        apply_budget_edge_priority(&mut weights, &[false, true, false], 2_000);
        assert!((weights[0] - 1.0).abs() < 1e-12);
        assert!((weights[1] - 2.4).abs() < 1e-12);
        assert!((weights[2] - 4.0).abs() < 1e-12);
        assert!((edge_priority_multiplier(0) - 1.0).abs() < 1e-12);
        assert!((edge_priority_multiplier(2_000) - 1.2).abs() < 1e-12);
        assert_eq!(DEFAULT_EDGE_PRIORITY_BOOST_BPS, 2_000);
    }

    #[test]
    fn band_status_names_are_stable() {
        assert_eq!(BandStatus::BelowTarget.as_str(), "below_target");
        assert_eq!(BandStatus::InBand.as_str(), "in_band");
        assert_eq!(BandStatus::AboveTarget.as_str(), "above_target");
        assert_eq!(MeterDimension::Cpu.as_str(), "cpu");
        assert_eq!(MeterDimension::Mem.as_str(), "mem");
        assert_eq!(MeterDimension::MinBuiltin.as_str(), "min_builtin");
    }

    #[test]
    fn policy_config_and_serde_roundtrip() {
        let policy = BudgetTargetPolicy {
            band_width_bps: DEFAULT_BAND_WIDTH_BPS,
            max_iterations: 16,
            edge_priority_boost_bps: DEFAULT_EDGE_PRIORITY_BOOST_BPS,
        };
        let config = BudgetTargetConfig::from_policy(&policy);
        assert!(config.is_valid());
        assert_eq!(config.band.width_bps, 500);
        assert_eq!(config.max_iterations, 16);
        assert_eq!(config.limits, MeteringLimits::default());
        assert_eq!(config.bounds, KnobBounds::default());

        let json = serde_json::to_string(&config).expect("serialize config");
        let back: BudgetTargetConfig = serde_json::from_str(&json).expect("deserialize config");
        assert_eq!(back, config);

        let edge = BudgetEdge {
            dimension: MeterDimension::Cpu,
            utilization_bps: 9_750,
        };
        let edge_json = serde_json::to_string(&edge).expect("serialize edge");
        let edge_back: BudgetEdge = serde_json::from_str(&edge_json).expect("deserialize edge");
        assert_eq!(edge_back, edge);
        assert_eq!(edge.dimension.as_str(), "cpu");
    }

    #[test]
    fn band_status_names_and_dimension_tags_roundtrip() {
        for dimension in MeterDimension::ALL {
            assert_eq!(
                MeterDimension::from_payload_tag(dimension.payload_tag()),
                Some(dimension)
            );
        }
        assert_eq!(MeterDimension::from_payload_tag(9), None);
        let json = serde_json::to_string(&BandStatus::InBand).expect("serialize");
        assert_eq!(json, "\"in_band\"");
        let back: BandStatus = serde_json::from_str("\"below_target\"").expect("deserialize");
        assert_eq!(back, BandStatus::BelowTarget);
    }
}
