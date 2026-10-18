//! Named fuzz campaign presets for repeatable run profiles.
//!
//! Presets bundle a **runtime mutation budget** (maximum mutation attempts per
//! campaign) and **mutation intensity** (how aggressively the engine explores the
//! mutation space). Values are fixed so CI and operators get predictable
//! behaviour: [`CampaignPreset::Smoke] for quick checks, [`CampaignPreset::Nightly`]
//! for scheduled runs, and [`CampaignPreset::Deep`] for exhaustive campaigns.
//
// Each preset also carries a plateau detection policy (rolling window, score
// threshold, and response action) so cost-aware budgeting behaviour is configured
// per campaign class (smoke/touch vs deep) and reproducible across runs.

use crate::dictionary::DictionaryId;
use crate::mutation_budget::MutationBudget;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// Predefined fuzz campaign profile (smoke, nightly, or deep).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CampaignPreset {
    /// Fast feedback: minimal budget and low exploration intensity.
    Smoke,
    /// Default scheduled profile: balanced budget and intensity.
    Nightly,
    /// Exhaustive: large budget and maximum mutation intensity.
    Deep,
}

/// Scheduling class of a campaign (#1904).
//
// Classes are ordered by priority — `Interactive` before `Nightly` before
// `Deep` — which decides who yields when capacity is contended and which
// scheduling window applies. See `docs/ops/capacity.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CampaignClass {
    /// Operator-triggered, someone is waiting on the result.
    Interactive,
    /// Scheduled recurring runs.
    Nightly,
    /// Long exhaustive campaigns that should use idle capacity.
    Deep,
}

impl CampaignClass {
    /// All classes in priority order (highest first).
    pub const ALL: [Self; 3] = [Self::Interactive, Self::Nightly, Self::Deep];

    /// Priority rank; lower runs first.
    pub const fn priority(self) -> u8 {
        match self {
            CampaignClass::Interactive => 0,
            CampaignClass::Nightly => 1,
            CampaignClass::Deep => 2,
        }
    }

    /// Stable snake_case name shared with the web API.
    pub const fn as_str(self) -> &'static str {
        match self {
            CampaignClass::Interactive => "interactive",
            CampaignClass::Nightly => "nightly",
            CampaignClass::Deep => "deep",
        }
    }
}

/// Action taken when a campaign sustains a plateau (no new signatures or
/// coverage within the rolling window).
///
/// The default is [`PlateauAction::Warn`], which records the plateau but
/// lets the campaign run to its configured budget. [`PlateauAction::Diversify`]
/// forces a dictionary/mutator mix change to escape the plateau, and
/// [`PlateauAction::StopEarly`] terminates the campaign in the terminal
/// `plateau_stop` state (reusing the cancellation machinery, W5-E05).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlateauAction {
    /// Record the plateau and continue (default).
    Warn,
    /// Force a dictionary/mutator mix change to escape the plateau.
    Diversify,
    /// Stop the campaign early in the `plateau_stop` terminal state.
    StopEarly,
}

impl PlateauAction {
    /// All actions in stable order (softest → hardest).
    pub const ALL: [Self; 3] = [Self::Warn, Self::Diversify, Self::StopEarly];

    /// Stable snake_case name for telemetry and the web API.
    pub const fn as_str(self) -> &'static str {
        match self {
            PlateauAction::Warn => "warn",
            PlateauAction::Diversify => "diversify",
            PlateauAction::StopEarly => "stop_early",
        }
    }
}

/// Plateau detection policy for a campaign class.
///
/// The detector rolls a window of `window_seeds` seeds and computes a plateau
/// score from signature novelty, coverage deltas, and mutator yield. When the
/// score stays at or below `score_threshold_bps` for `sustained_windows` consecutive
/// windows, the configured [`PlateauAction`] is triggered.
//
// Smoke/interactive campaigns use a shorter window and higher threshold so they
// stop wasting interactive latency on flat runs; deep campaigns use a longer
// window and lower threshold so they only react to sustained plateaus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlateauPolicy {
    /// Number of seeds per rolling observation window.
    pub window_seeds: u64,
    /// Plateau score threshold in basis-points (0-10_000). At or below
    /// this score the window is considered plateaued.
    pub score_threshold_bps: u32,
    /// How many consecutive plateaued windows are required before the
    /// [`PlateauAction`] is triggered.
    pub sustained_windows: u32,
    /// Action to take once the plateau is sustained.
    pub action: PlateauAction,
}

impl PlateauPolicy {
    /// Returns `true` when the policy is well-formed: a nonzero window,
    /// a threshold within basis-point range, and at least one sustained
    /// window.
    pub const fn is_valid(&self) -> bool {
        self.window_seeds > 0
            && self.score_threshold_bps <= 10_000
            && self.sustained_windows > 0
    }

    /// Classifies a plateau score (in basis points) against this policy's
    /// threshold.
    pub const fn is_plateaued(&self, score_bps: u32) -> bool {
        score_bps <= self.score_threshold_bps
    }
}

/// Parameters derived from a [`CampaignPreset`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CampaignParameters {
    /// Maximum mutation attempts for the campaign (runtime budget cap).
    pub max_mutations_per_run: u64,
    /// Mutation intensity in basis-points (0–10_000). Higher values imply
    /// more aggressive scheduling of mutators and deeper exploration per seed.
    pub mutation_intensity_bps: u32,
    /// Deterministic base seed for this preset.
    ///
    /// The same preset always starts from the same `base_seed`, so replaying
    /// with the same preset reproduces the same mutation stream.
    pub base_seed: u64,
}

impl CampaignPreset {
    /// All presets in stable order: smoke → nightly → deep.
    pub const ALL: [Self; 3] = [Self::Smoke, Self::Nightly, Self::Deep];

    /// Returns the fixed parameters for this preset.
    pub const fn parameters(self) -> CampaignParameters {
        match self {
            CampaignPreset::Smoke => CampaignParameters {
                max_mutations_per_run: 1_000,
                mutation_intensity_bps: 2_500,
                base_seed: 0x9E37_79B9_7FA4_7C01,
            },
            CampaignPreset::Nightly => CampaignParameters {
                max_mutations_per_run: 100_000,
                mutation_intensity_bps: 5_000,
                base_seed: 0x9E37_79B9_7FA4_7C02,
            },
            CampaignPreset::Deep => CampaignParameters {
                max_mutations_per_run: 10_000_000,
                mutation_intensity_bps: 10_000,
                base_seed: 0x9E37_79B9_7FA4_7C03,
            },
        }
    }

    /// Returns a [`MutationBudget`] initialised with this preset's cap.
    pub fn to_mutation_budget(self) -> MutationBudget {
        MutationBudget::new(self.parameters().max_mutations_per_run)
    }

    /// Scheduling class: `smoke` is interactive feedback, `nightly` is the
    /// scheduled profile, `deep` is exhaustive work for idle capacity.
    pub const fn class(self) -> CampaignClass {
        match self {
            CampaignPreset::Smoke => CampaignClass::Interactive,
            CampaignPreset::Nightly => CampaignClass::Nightly,
            CampaignPreset::Deep => CampaignClass::Deep,
        }
    }

    /// Plateau detection policy for this preset's class.
    ///
    /// Smoke uses a short window and high threshold and stops early once
    /// sustained — the operator is waiting. Nightly warns by default so
    /// scheduled runs still produce a full report. Deep diversifies to escape
    /// plateaus before giving up on idle capacity.
    pub const fn plateau_policy(self) -> PlateauPolicy {
        match self {
            CampaignPreset::Smoke => PlateauPolicy {
                window_seeds: 250,
                score_threshold_bps: 500,
                sustained_windows: 2,
                action: PlateauAction::StopEarly,
            },
            CampaignPreset::Nightly => PlateauPolicy {
                window_seeds: 10_000,
                score_threshold_bps: 1_000,
                sustained_windows: 3,
                action: PlateauAction::Warn,
            },
            CampaignPreset::Deep => PlateauPolicy {
                window_seeds: 100_000,
                score_threshold_bps: 2_500,
                sustained_windows: 4,
                action: PlateauAction::Diversify,
            },
        }
    }

    /// Relative resource units one seed of this preset costs, used for cost
    /// attribution (seeds × units). Derived from mutation intensity — a
    /// placeholder until measured per-seed resource units are available — so
    /// smoke = 1, nightly = 2, deep = 4.
    pub const fn resource_units_per_seed(self) -> u64 {
        let units = self.parameters().mutation_intensity_bps as u64 / 2_500;
        if units == 0 {
            1
        } else {
            units
        }
    }

    /// Scales `base_weights` by this preset's `mutation_intensity_bps`.
    ///
    /// Intensity is interpreted as a fraction of 10_000 basis points.
    /// The input weights are multiplied by `intensity / 10_000`.  This keeps
    /// the *relative* weight ordering unchanged while the overall
    /// exploration rate is tuned per preset.
    pub fn apply_intensity(self, base_weights: &mut [f64]) {
        let intensity = self.parameters().mutation_intensity_bps as f64 / 10_000.0;
        for w in base_weights.iter_mut() {
            *w *= intensity;
        }
    }

    /// Dictionary selected for this preset (W5-B02).
    ///
    /// Every preset ships the curated Soroban pitfall dictionary so known-hard
    /// edges (TTL, archival, depth, metering, address classes) are exercised by
    /// default. Deeper presets use the full dictionary; smoke uses the same
    /// content but with a lower injection probability (see
    /// [`CampaignPreset::dictionary_injection_bps`]).
    pub const fn dictionary(self) -> DictionaryId {
        DictionaryId::SorobanPitfalls
    }

    /// Probability, in basis points, that a mutation attempt injects a
    /// dictionary value instead of a purely random one.
    ///
    /// Smoke keeps injection light so quick runs stay fast; nightly and deep
    /// bias heavily toward curated values so known-hard edges are hit early.
    pub const fn dictionary_injection_bps(self) -> u32 {
        match self {
            CampaignPreset::Smoke => 2_500,
            CampaignPreset::Nightly => 5_000,
            CampaignPreset::Deep => 7_500,
        }
    }

    /// Read preset from the `CRASHLAB_PRESET` environment variable.
    ///
    /// Unset or unrecognised values fall back to [`CampaignPreset::Nightly`] so
    /// existing CI and scheduled runs keep their current behaviour.
    pub fn from_env_or_default() -> Self {
        std::env::var("CRASHLAB_PRESET")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or_default()
    }

    /// Stable snake_case name for CLI and metadata.
    pub const fn as_str(self) -> &'static str {
        match self {
            CampaignPreset::Smoke => "smoke",
            CampaignPreset::Nightly => "nightly",
            CampaignPreset::Deep => "deep",
        }
    }
}

impl Default for CampaignPreset {
    /// [`Nightly`] is the default so existing CI jobs continue with the
    /// same budget and intensity they had before presets were selectable.
    fn default() -> Self {
        Self::Nightly
    }
}

impl fmt::Display for CampaignPreset {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Parse from `smoke`, `nightly`, or `deep` (case-insensitive).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseCampaignPresetError(pub String);

impl fmt::Display for ParseCampaignPresetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "unknown campaign preset {:?}: expected smoke, nightly, or deep",
            self.0
        )
    }
}

impl std::error::Error for ParseCampaignPresetError {}

impl FromStr for CampaignPreset {
    type Err = ParseCampaignPresetError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "smoke" => Ok(CampaignPreset::Smoke),
            "nightly" => Ok(CampaignPreset::Nightly),
            "deep" => Ok(CampaignPreset::Deep),
            _ => Err(ParseCampaignPresetError(s.trim().to_owned())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_order_by_budget_and_intensity() {
        let s = CampaignPreset::Smoke.parameters();
        let n = CampaignPreset::Nightly.parameters();
        let d = CampaignPreset::Deep.parameters();

        assert!(s.max_mutations_per_run < n.max_mutations_per_run);
        assert!(n.max_mutations_per_run < d.max_mutations_per_run);

        assert!(s.mutation_intensity_bps < n.mutation_intensity_bps);
        assert!(n.mutation_intensity_bps < d.mutation_intensity_bps);
    }

    #[test]
    fn intensity_bps_within_range() {
        for p in CampaignPreset::ALL {
            let x = p.parameters().mutation_intensity_bps;
            assert!(x <= 10_000, "intensity must be at most 10000 bps");
        }
    }

    #[test]
    fn parse_roundtrip() {
        assert_eq!(
            "smoke".parse::<CampaignPreset>().unwrap(),
            CampaignPreset::Smoke
        );
        assert_eq!(
            "NIGHTLY".parse::<CampaignPreset>().unwrap(),
            CampaignPreset::Nightly
        );
        assert_eq!(
            " Deep ".parse::<CampaignPreset>().unwrap(),
            CampaignPreset::Deep
        );
        assert!("".parse::<CampaignPreset>().is_err());
    }

    #[test]
    fn serde_roundtrip() {
        let json = serde_json::to_string(&CampaignPreset::Nightly).unwrap();
        assert_eq!(json, "\"nightly\"");
        let back: CampaignPreset = serde_json::from_str(&json).unwrap();
        assert_eq!(back, CampaignPreset::Nightly);
    }

    #[test]
    fn display_matches_as_str() {
        for p in CampaignPreset::ALL {
            assert_eq!(p.to_string(), p.as_str());
        }
    }

    #[test]
    fn presets_map_to_priority_ordered_classes() {
        assert_eq!(CampaignPreset::Smoke.class(), CampaignClass::Interactive);
        assert_eq!(CampaignPreset::Nightly.class(), CampaignClass::Nightly);
        assert_eq!(CampaignPreset::Deep.class(), CampaignClass::Deep);
        assert!(CampaignClass::Interactive < CampaignClass::Nightly);
        assert!(CampaignClass::Nightly < CampaignClass::Deep);
        let ranks: Vec<u8> = CampaignClass::ALL.iter().map(|c| c.priority()).collect();
        assert_eq!(ranks, vec![0, 1, 2]);
        assert_eq!(
            serde_json::to_string(&CampaignClass::Interactive).unwrap(),
            "\"interactive\""
        );
        assert_eq!(CampaignClass::Deep.as_str(), "deep");
    }

    #[test]
    fn resource_units_scale_with_intensity() {
        assert_eq!(CampaignPreset::Smoke.resource_units_per_seed(), 1);
        assert_eq!(CampaignPreset::Nightly.resource_units_per_seed(), 2);
        assert_eq!(CampaignPreset::Deep.resource_units_per_seed(), 4);
    }

    #[test]
    fn default_is_nightly() {
        assert_eq!(CampaignPreset::default(), CampaignPreset::Nightly);
    }

    #[test]
    fn parameters_contain_expected_values() {
        let s = CampaignPreset::Smoke.parameters();
        assert_eq!(s.max_mutations_per_run, 1_000);
        assert_eq!(s.mutation_intensity_bps, 2_500);
        assert_eq!(s.base_seed, 0x9E37_79B9_7FA4_7C01);

        let n = CampaignPreset::Nightly.parameters();
        assert_eq!(n.max_mutations_per_run, 100_000);
        assert_eq!(n.mutation_intensity_bps, 5_000);
        assert_eq!(n.base_seed, 0x9E37_79B9_7FA4_7C02);

        let d = CampaignPreset::Deep.parameters();
        assert_eq!(d.max_mutations_per_run, 10_000_000);
        assert_eq!(d.mutation_intensity_bps, 10_000);
        assert_eq!(d.base_seed, 0x9E37_79B9_7FA4_7C03);
    }

    #[test]
    fn to_mutation_budget_matches_preset_cap() {
        let budget = CampaignPreset::Smoke.to_mutation_budget();
        let report = budget.report();
        assert_eq!(report.budget, 1_000);
        assert!(!report.exhausted);
    }

    #[test]
    fn apply_intensity_scales_weights() {
        let mut weights = vec![1.0, 2.0, 3.0];
        CampaignPreset::Smoke.apply_intensity(&mut weights);
        // Smoke intensity = 2500 / 10000 = 0.25
        assert_eq!(weights, vec![0.25, 0.5, 0.75]);
    }

    #[test]
    fn apply_intensity_full_keeps_weights_unchanged() {
        let mut weights = vec![1.0, 2.0, 3.0];
        CampaignPreset::Deep.apply_intensity(&mut weights);
        // Deep intensity = 10000 / 10000 = 1.0
        assert_eq!(weights, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn every_preset_selects_the_soroban_dictionary() {
        for p in CampaignPreset::ALL {
            assert_eq!(p.dictionary(), DictionaryId::SorobanPitfalls);
        }
    }

    #[test]
    fn dictionary_injection_probability_is_bounded_and_ordered() {
        let s = CampaignPreset::Smoke.dictionary_injection_bps();
        let n = CampaignPreset::Nightly.dictionary_injection_bps();
        let d = CampaignPreset::Deep.dictionary_injection_bps();
        assert!(s < n);
        assert!(n < d);
        for p in CampaignPreset::ALL {
            let bps = p.dictionary_injection_bps();
            assert!(bps <= 10_000, "injection probability must be at most 10000 bps");
        }
    }
}