//! Named fuzz campaign presets for repeatable run profiles.
//!
//! Presets bundle a **runtime mutation budget** (maximum mutation attempts per
//! campaign) and **mutation intensity** (how aggressively the engine explores
//! the mutation space). Values are fixed so CI and operators get predictable
//! behaviour: [`CampaignPreset::Smoke`] for quick checks, [`CampaignPreset::Nightly`]
//! for scheduled runs, and [`CampaignPreset::Deep`] for exhaustive campaigns.

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

/// Parameters derived from a [`CampaignPreset`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CampaignParameters {
    /// Maximum mutation attempts for the campaign (runtime budget cap).
    pub max_mutations_per_run: u64,
    /// Mutation intensity in basis points (0–10_000). Higher values imply
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
                base_seed: 0x9E37_79B9_7F4A_7C01,
            },
            CampaignPreset::Nightly => CampaignParameters {
                max_mutations_per_run: 100_000,
                mutation_intensity_bps: 5_000,
                base_seed: 0x9E37_79B9_7F4A_7C02,
            },
            CampaignPreset::Deep => CampaignParameters {
                max_mutations_per_run: 10_000_000,
                mutation_intensity_bps: 10_000,
                base_seed: 0x9E37_79B9_7F4A_7C03,
            },
        }
    }

    /// Returns a [`MutationBudget`] initialised with this preset's cap.
    pub fn to_mutation_budget(self) -> MutationBudget {
        MutationBudget::new(self.parameters().max_mutations_per_run)
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
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
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
            _ => Err(ParseCampaignPresetError(s.to_string())),
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
    fn default_is_nightly() {
        assert_eq!(CampaignPreset::default(), CampaignPreset::Nightly);
    }

    #[test]
    fn parameters_contain_expected_values() {
        let s = CampaignPreset::Smoke.parameters();
        assert_eq!(s.max_mutations_per_run, 1_000);
        assert_eq!(s.mutation_intensity_bps, 2_500);
        assert_eq!(s.base_seed, 0x9E37_79B9_7F4A_7C01);

        let n = CampaignPreset::Nightly.parameters();
        assert_eq!(n.max_mutations_per_run, 100_000);
        assert_eq!(n.mutation_intensity_bps, 5_000);
        assert_eq!(n.base_seed, 0x9E37_79B9_7F4A_7C02);

        let d = CampaignPreset::Deep.parameters();
        assert_eq!(d.max_mutations_per_run, 10_000_000);
        assert_eq!(d.mutation_intensity_bps, 10_000);
        assert_eq!(d.base_seed, 0x9E37_79B9_7F4A_7C03);
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
    fn base_seed_is_stable_per_preset() {
        // Determinism: same preset always yields the same base_seed.
        assert_eq!(
            CampaignPreset::Nightly.parameters().base_seed,
            CampaignPreset::Nightly.parameters().base_seed
        );
        assert_eq!(
            CampaignPreset::Deep.parameters().base_seed,
            CampaignPreset::Deep.parameters().base_seed
        );
        assert_ne!(
            CampaignPreset::Smoke.parameters().base_seed,
            CampaignPreset::Deep.parameters().base_seed
        );
    }

    #[test]
    fn preset_with_zero_budget_skips_all() {
        let mut budget = MutationBudget::new(0);
        assert!(!budget.try_attempt());
        assert!(!budget.try_attempt());
        let r = budget.report();
        assert_eq!(r.attempts_made, 0);
        assert_eq!(r.skipped, 2);
        assert!(r.exhausted);
    }

    #[test]
    fn from_env_or_default_reads_env() {
        // Set env and read.
        std::env::set_var("CRASHLAB_PRESET", "deep");
        assert_eq!(CampaignPreset::from_env_or_default(), CampaignPreset::Deep);

        // Invalid value → Nightly (default).
        std::env::set_var("CRASHLAB_PRESET", "bogus");
        assert_eq!(
            CampaignPreset::from_env_or_default(),
            CampaignPreset::Nightly
        );

        // Unset → Nightly (default).
        std::env::remove_var("CRASHLAB_PRESET");
        assert_eq!(
            CampaignPreset::from_env_or_default(),
            CampaignPreset::Nightly
        );
    }
}
