//! Baseline signature classification gate (#1861).
//!
//! A [`Baseline`] records the crash signatures that were known at a point in
//! time. [`classify`] compares observed signatures against it and sorts them
//! into three buckets:
//!
//! - **new**: observed, and not an `Open` baseline entry (a new failure, or a
//!   `Fixed` entry that came back);
//! - **recurring**: observed, and an `Open` baseline entry;
//! - **fixed**: an `Open` baseline entry that was not observed.
//!
//! Signatures are the existing FNV-1a hashes from [`crate::signature_hash`]
//! (via [`crate::classify`]), normalized to 16 lowercase hex digits. No new
//! hashing scheme is introduced.
//!
//! # On-disk format
//!
//! Pretty JSON with `version`, `integrity` and `entries`. `integrity` is the
//! SHA-256 (see [`crate::provenance::sha256_hex`]) of `baseline-v<version>\n`
//! followed by the compact JSON of `entries` in stored order. [`Baseline::from_json`]
//! recomputes it and returns [`BaselineError::Corrupt`] on mismatch.
//!
//! # Exit codes (`crashlab regression baseline compare`)
//!
//! - `2`: baseline could not be loaded or failed integrity verification;
//! - `1`: at least one *new* signature;
//! - `0`: otherwise (recurring and fixed are reported but do not fail).
//!
//! # CI rollout plan (not yet wired)
//!
//! This module does not change `.github/workflows`. The planned rollout is:
//!
//! 1. Report-only: run `regression baseline compare` in CI, print the three
//!    reports into the job summary, and ignore the exit code.
//! 2. Gating: once the baseline has been reviewed, fail the job on exit code
//!    `1` (new) and `2` (corrupt baseline).
//!
//! The existing `regression-suite` workflow and `docs/REGRESSION_SUMMARY.md`
//! use a different baseline file (`regression-baseline.json`). This format
//! has not been reconciled with it.

use crate::provenance::sha256_hex;
use crate::scenario_export::FailureScenario;
use crate::CaseSeed;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Schema version written to and accepted from baseline files.
pub const BASELINE_SCHEMA_VERSION: u32 = 1;

/// Lifecycle state of a baseline entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
    /// Known failure that is still expected to reproduce.
    Open,
    /// Previously known failure that has been resolved.
    Fixed,
}

/// One known signature in a baseline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BaselineEntry {
    /// Normalized signature hash (16 lowercase hex digits).
    pub signature_hash: String,
    /// Failure category reported with the signature.
    pub category: String,
    /// Label of the baseline run that first recorded this signature.
    /// Caller-supplied, so output stays deterministic.
    pub first_seen: String,
    pub status: EntryStatus,
}

/// Signature observed in a run.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ObservedSignature {
    pub signature_hash: String,
    pub category: String,
}

/// In-memory baseline. Entries are kept sorted by `signature_hash`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Baseline {
    pub version: u32,
    pub entries: Vec<BaselineEntry>,
}

/// Output of [`classify`]. Each list is sorted by `signature_hash`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Classification {
    pub new: Vec<ObservedSignature>,
    pub recurring: Vec<ObservedSignature>,
    pub fixed: Vec<BaselineEntry>,
}

/// Errors from loading or verifying a baseline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BaselineError {
    /// Integrity hash does not match the entries.
    Corrupt { expected: String, actual: String },
    /// File is not valid baseline JSON.
    Malformed(String),
    /// Schema version is not supported by this build.
    UnsupportedVersion(u32),
}

impl fmt::Display for BaselineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BaselineError::Corrupt { expected, actual } => write!(
                f,
                "baseline integrity check failed: expected {expected}, computed {actual}"
            ),
            BaselineError::Malformed(msg) => write!(f, "malformed baseline: {msg}"),
            BaselineError::UnsupportedVersion(v) => write!(f, "unsupported baseline version: {v}"),
        }
    }
}

impl std::error::Error for BaselineError {}

/// On-disk envelope. Private: callers use [`Baseline::to_json`] / [`Baseline::from_json`].
#[derive(Debug, Serialize, Deserialize)]
struct BaselineFile {
    version: u32,
    integrity: String,
    entries: Vec<BaselineEntry>,
}

/// Normalizes a numeric signature hash to 16 lowercase hex digits.
pub fn normalize_signature_hash(hash: u64) -> String {
    format!("{hash:016x}")
}

fn integrity_of(version: u32, entries: &[BaselineEntry]) -> Result<String, BaselineError> {
    let canonical =
        serde_json::to_string(entries).map_err(|e| BaselineError::Malformed(e.to_string()))?;
    Ok(sha256_hex(
        format!("baseline-v{version}\n{canonical}").as_bytes(),
    ))
}

impl Baseline {
    /// Builds an all-`Open` baseline from observed signatures.
    ///
    /// Duplicate hashes collapse to one entry. The smallest category wins, so
    /// input order does not matter.
    pub fn from_observed(observed: &[ObservedSignature], first_seen: &str) -> Baseline {
        let mut sorted: Vec<ObservedSignature> = observed.to_vec();
        sorted.sort();
        let mut map: BTreeMap<String, BaselineEntry> = BTreeMap::new();
        for o in sorted {
            map.entry(o.signature_hash.clone())
                .or_insert_with(|| BaselineEntry {
                    signature_hash: o.signature_hash,
                    category: o.category,
                    first_seen: first_seen.to_string(),
                    status: EntryStatus::Open,
                });
        }
        Baseline {
            version: BASELINE_SCHEMA_VERSION,
            entries: map.into_values().collect(),
        }
    }

    /// Serializes to pretty JSON with a fresh integrity hash.
    pub fn to_json(&self) -> Result<String, BaselineError> {
        let integrity = integrity_of(self.version, &self.entries)?;
        let file = BaselineFile {
            version: self.version,
            integrity,
            entries: self.entries.clone(),
        };
        serde_json::to_string_pretty(&file).map_err(|e| BaselineError::Malformed(e.to_string()))
    }

    /// Parses and verifies a baseline. Returns [`BaselineError::Corrupt`] if the
    /// integrity hash does not match.
    pub fn from_json(json: &str) -> Result<Baseline, BaselineError> {
        let file: BaselineFile =
            serde_json::from_str(json).map_err(|e| BaselineError::Malformed(e.to_string()))?;
        if file.version != BASELINE_SCHEMA_VERSION {
            return Err(BaselineError::UnsupportedVersion(file.version));
        }
        let actual = integrity_of(file.version, &file.entries)?;
        if actual != file.integrity {
            return Err(BaselineError::Corrupt {
                expected: file.integrity,
                actual,
            });
        }
        Ok(Baseline {
            version: file.version,
            entries: file.entries,
        })
    }
}

/// Classifies observed signatures against `baseline`.
///
/// Pure function. Output does not depend on the order of `observed` or of
/// `baseline.entries`. Duplicate observed hashes are counted once.
pub fn classify(baseline: &Baseline, observed: &[ObservedSignature]) -> Classification {
    let mut observed_sorted: Vec<ObservedSignature> = observed.to_vec();
    observed_sorted.sort();
    observed_sorted.dedup_by(|a, b| a.signature_hash == b.signature_hash);

    let open: BTreeSet<&str> = baseline
        .entries
        .iter()
        .filter(|e| e.status == EntryStatus::Open)
        .map(|e| e.signature_hash.as_str())
        .collect();
    let observed_hashes: BTreeSet<&str> = observed_sorted
        .iter()
        .map(|o| o.signature_hash.as_str())
        .collect();

    // Computed first: `observed_hashes` borrows `observed_sorted`, which is
    // consumed by the loop below.
    let mut fixed: Vec<BaselineEntry> = baseline
        .entries
        .iter()
        .filter(|e| e.status == EntryStatus::Open)
        .filter(|e| !observed_hashes.contains(e.signature_hash.as_str()))
        .cloned()
        .collect();
    fixed.sort_by(|a, b| a.signature_hash.cmp(&b.signature_hash));

    let mut out = Classification {
        fixed,
        ..Classification::default()
    };
    for o in observed_sorted {
        if open.contains(o.signature_hash.as_str()) {
            out.recurring.push(o);
        } else {
            out.new.push(o);
        }
    }
    out
}

/// Maps a classification to the process exit code.
///
/// `2` if the baseline is unusable, `1` if any signature is new, `0` otherwise.
pub fn exit_code(c: &Classification, baseline_ok: bool) -> i32 {
    if !baseline_ok {
        2
    } else if !c.new.is_empty() {
        1
    } else {
        0
    }
}

/// Replays scenarios and returns the observed signatures.
///
/// Uses [`crate::classify`] on each decoded seed, the same path as
/// `regression-suite`.
pub fn observe_scenarios(scenarios: &[FailureScenario]) -> Result<Vec<ObservedSignature>, String> {
    scenarios
        .iter()
        .map(|s| {
            let payload = hex::decode(s.input_payload.trim())
                .map_err(|e| format!("seed {}: invalid input_payload hex: {e}", s.seed_id))?;
            let sig = crate::classify(&CaseSeed {
                id: s.seed_id,
                payload,
            });
            Ok(ObservedSignature {
                signature_hash: normalize_signature_hash(sig.signature_hash),
                category: sig.category,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obs(hash: &str, category: &str) -> ObservedSignature {
        ObservedSignature {
            signature_hash: hash.to_string(),
            category: category.to_string(),
        }
    }

    fn hashes(v: &[ObservedSignature]) -> Vec<&str> {
        v.iter().map(|o| o.signature_hash.as_str()).collect()
    }

    fn golden_baseline() -> Baseline {
        Baseline::from_observed(
            &[
                obs("000000000000000a", "auth"),
                obs("000000000000000b", "budget"),
                obs("000000000000000c", "xdr"),
            ],
            "baseline-v1",
        )
    }

    #[test]
    fn golden_new_recurring_and_fixed() {
        // a is fixed, b and c recur, d is new.
        let observed = [
            obs("000000000000000b", "budget"),
            obs("000000000000000c", "xdr"),
            obs("000000000000000d", "state"),
        ];
        let c = classify(&golden_baseline(), &observed);
        assert_eq!(hashes(&c.new), vec!["000000000000000d"]);
        assert_eq!(hashes(&c.recurring), vec!["000000000000000b", "000000000000000c"]);
        assert_eq!(c.fixed.len(), 1);
        assert_eq!(c.fixed[0].signature_hash, "000000000000000a");
        assert_eq!(c.fixed[0].category, "auth");
    }

    #[test]
    fn fixed_status_entry_observed_again_is_new() {
        let baseline = Baseline {
            version: BASELINE_SCHEMA_VERSION,
            entries: vec![BaselineEntry {
                signature_hash: "00000000000000ff".to_string(),
                category: "state".to_string(),
                first_seen: "baseline-v1".to_string(),
                status: EntryStatus::Fixed,
            }],
        };
        let c = classify(&baseline, &[obs("00000000000000ff", "state")]);
        assert_eq!(hashes(&c.new), vec!["00000000000000ff"]);
        assert!(c.recurring.is_empty());
        assert!(c.fixed.is_empty());
    }

    #[test]
    fn exit_code_mapping() {
        let clean = classify(&golden_baseline(), &[]);
        let with_new = classify(&golden_baseline(), &[obs("00000000000000ee", "x")]);
        assert_eq!(exit_code(&clean, true), 0);
        assert_eq!(exit_code(&with_new, true), 1);
        assert_eq!(exit_code(&with_new, false), 2);
        assert_eq!(exit_code(&Classification::default(), false), 2);
    }

    #[test]
    fn baseline_round_trips_through_json() {
        let baseline = golden_baseline();
        let json = baseline.to_json().unwrap();
        let restored = Baseline::from_json(&json).unwrap();
        assert_eq!(restored, baseline);
    }

    #[test]
    fn tampered_baseline_is_corrupt_and_exits_2() {
        let json = golden_baseline().to_json().unwrap();
        let tampered = json.replace("000000000000000a", "000000000000000e");
        assert_ne!(tampered, json);
        let err = Baseline::from_json(&tampered).unwrap_err();
        assert!(matches!(err, BaselineError::Corrupt { .. }));

        // Load failure path used by the CLI.
        let code = match Baseline::from_json(&tampered) {
            Ok(b) => exit_code(&classify(&b, &[]), true),
            Err(_) => exit_code(&Classification::default(), false),
        };
        assert_eq!(code, 2);
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let json = golden_baseline().to_json().unwrap();
        let bumped = json.replacen("\"version\": 1", "\"version\": 99", 1);
        assert_eq!(
            Baseline::from_json(&bumped).unwrap_err(),
            BaselineError::UnsupportedVersion(99)
        );
    }

    #[test]
    fn classification_is_identical_under_shuffled_input() {
        let observed = vec![
            obs("000000000000000d", "state"),
            obs("000000000000000b", "budget"),
            obs("000000000000000c", "xdr"),
            obs("000000000000000c", "xdr"),
            obs("00000000000000ee", "auth"),
        ];
        let mut shuffled = observed.clone();
        shuffled.reverse();
        shuffled.rotate_left(2);

        let base_a = Baseline::from_observed(&observed, "baseline-v1");
        let base_b = Baseline::from_observed(&shuffled, "baseline-v1");
        assert_eq!(base_a.to_json().unwrap(), base_b.to_json().unwrap());

        let run_a = classify(&golden_baseline(), &observed);
        let run_b = classify(&golden_baseline(), &shuffled);
        assert_eq!(run_a, run_b);
        // Run again to rule out hidden state.
        assert_eq!(run_a, classify(&golden_baseline(), &observed));
    }

    #[test]
    fn observe_scenarios_rejects_bad_hex() {
        let scenarios = vec![FailureScenario {
            seed_id: 3,
            input_payload: "zz".into(),
            mode: "none".into(),
            failure_class: "runtime-failure".into(),
        }];
        assert!(observe_scenarios(&scenarios).is_err());
    }

    #[test]
    fn observe_scenarios_hash_is_normalized() {
        let scenarios = vec![FailureScenario {
            seed_id: 7,
            input_payload: hex::encode([1u8, 2, 3]),
            mode: "none".into(),
            failure_class: "runtime-failure".into(),
        }];
        let observed = observe_scenarios(&scenarios).unwrap();
        assert_eq!(observed.len(), 1);
        assert_eq!(observed[0].signature_hash.len(), 16);
        assert!(observed[0].signature_hash.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
