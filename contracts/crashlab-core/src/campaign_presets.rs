//! Named fuzz campaign presets for repeatable run profiles.
//!
//! Presets bundle a **runtime mutation budget** (maximum mutation attempts per
//! campaign) and **mutation intensity** (how aggressively the engine explores
//! the mutation space). Values are fixed so CI and operators get predictable
//! behaviour: [`CampaignPreset::Smoke`] for quick checks, [`CampaignPreset::Nightly`]
//! for scheduled runs, and [`CampaignPreset::Deep`] for exhaustive campaigns.

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
            },
            CampaignPreset::Nightly => CampaignParameters {
                max_mutations_per_run: 100_000,
                mutation_intensity_bps: 5_000,
            },
            CampaignPreset::Deep => CampaignParameters {
                max_mutations_per_run: 10_000_000,
                mutation_intensity_bps: 10_000,
            },
        }
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
}
