//! Bounded simulation runs with configurable wall-clock timeouts.
//!
//! When a user-supplied simulator exceeds the configured limit, the result is a
//! [`CrashSignature`](crate::CrashSignature) with category `"timeout"` so runs
//! can be triaged like other failure classes.
//!
//! [`RunMetadata`] is versioned for JSON persistence; use [`load_run_metadata_json`] /
//! [`save_run_metadata_json`] so older on-disk shapes are accepted and upgraded.

use crate::{compute_signature_hash, CaseSeed, CrashSignature};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Current schema version written by [`save_run_metadata_json`] and [`RunMetadata::from_timeout_config`].
pub const RUN_METADATA_SCHEMA_VERSION: u32 = 1;

/// Schema versions this crate can load (may be normalized to [`RUN_METADATA_SCHEMA_VERSION`]).
pub const SUPPORTED_RUN_METADATA_SCHEMAS: &[u32] = &[1];

/// Wall-clock limit for a single simulation invocation (milliseconds).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulationTimeoutConfig {
    pub timeout_ms: u64,
}

impl SimulationTimeoutConfig {
    pub const fn new(timeout_ms: u64) -> Self {
        Self { timeout_ms }
    }
}

/// Metadata surfaced alongside a fuzzing run (e.g. for dashboards and CI logs).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunMetadata {
    /// Format discriminator for JSON; omitted in legacy payloads defaults to `1`.
    #[serde(default = "run_metadata_schema_deserialize_default")]
    pub schema: u32,
    /// Active simulation timeout used for this run (milliseconds).
    pub simulation_timeout_ms: u64,
}

fn run_metadata_schema_deserialize_default() -> u32 {
    1
}

impl RunMetadata {
    pub fn from_timeout_config(cfg: &SimulationTimeoutConfig) -> Self {
        Self {
            schema: RUN_METADATA_SCHEMA_VERSION,
            simulation_timeout_ms: cfg.timeout_ms,
        }
    }

    /// Normalizes a decoded value to [`RUN_METADATA_SCHEMA_VERSION`], applying
    /// in-place migrations when newer fields are added in future schema bumps.
    pub fn upgrade_to_current(self) -> Result<Self, RunMetadataError> {
        validate_and_upgrade_run_metadata(self)
    }
}

/// Errors from loading or migrating run metadata JSON.
#[derive(Debug)]
pub enum RunMetadataError {
    /// `serde_json` decode failure.
    Json(serde_json::Error),
    /// Document `schema` is not a supported version.
    UnsupportedSchema { found: u32 },
}

impl fmt::Display for RunMetadataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunMetadataError::Json(e) => write!(f, "run metadata JSON error: {e}"),
            RunMetadataError::UnsupportedSchema { found } => write!(
                f,
                "unsupported run metadata schema version {found} (supported: {:?})",
                SUPPORTED_RUN_METADATA_SCHEMAS
            ),
        }
    }
}

impl std::error::Error for RunMetadataError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            RunMetadataError::Json(e) => Some(e),
            RunMetadataError::UnsupportedSchema { .. } => None,
        }
    }
}

impl From<serde_json::Error> for RunMetadataError {
    fn from(e: serde_json::Error) -> Self {
        RunMetadataError::Json(e)
    }
}

fn validate_and_upgrade_run_metadata(meta: RunMetadata) -> Result<RunMetadata, RunMetadataError> {
    if !SUPPORTED_RUN_METADATA_SCHEMAS.contains(&meta.schema) {
        return Err(RunMetadataError::UnsupportedSchema { found: meta.schema });
    }

    let mut m = meta;
    while m.schema < RUN_METADATA_SCHEMA_VERSION {
        m = match m.schema {
            // Placeholder for future migrations, e.g. 1 -> 2 when new fields land.
            1 => RunMetadata {
                schema: RUN_METADATA_SCHEMA_VERSION,
                simulation_timeout_ms: m.simulation_timeout_ms,
            },
            _ => {
                return Err(RunMetadataError::UnsupportedSchema { found: m.schema });
            }
        };
    }

    Ok(m)
}

/// Parses run metadata from JSON bytes, accepting legacy documents without a `schema` field.
pub fn load_run_metadata_json(bytes: &[u8]) -> Result<RunMetadata, RunMetadataError> {
    let meta: RunMetadata = serde_json::from_slice(bytes)?;
    validate_and_upgrade_run_metadata(meta)
}

/// Serializes run metadata to pretty JSON bytes at [`RUN_METADATA_SCHEMA_VERSION`].
pub fn save_run_metadata_json(meta: &RunMetadata) -> Result<Vec<u8>, RunMetadataError> {
    let normalized = validate_and_upgrade_run_metadata(meta.clone())?;
    serde_json::to_vec_pretty(&normalized).map_err(RunMetadataError::from)
}

/// Builds the crash signature used when a simulation hits the timeout wall.
pub fn timeout_crash_signature(seed: &CaseSeed) -> CrashSignature {
    let category = "timeout";
    let digest = seed.payload.iter().fold(seed.id, |acc, b| {
        acc.wrapping_mul(1099511628211).wrapping_add(*b as u64)
    }) ^ 0x7F4A_7C15_4E3F_4E3Fu64;
    let signature_hash = compute_signature_hash(category, &seed.payload);
    CrashSignature {
        category: category.to_string(),
        digest,
        signature_hash,
    }
}

/// Runs `simulator` on a worker thread; if it does not finish within `config`,
/// returns [`timeout_crash_signature`] instead.
///
/// If the timeout fires, the worker thread is not forcibly stopped (host code
/// may still run to completion in the background).
pub fn run_simulation_with_timeout<F>(
    seed: &CaseSeed,
    config: &SimulationTimeoutConfig,
    simulator: F,
) -> CrashSignature
where
    F: FnOnce(&CaseSeed) -> CrashSignature + Send + 'static,
{
    if config.timeout_ms == 0 {
        return timeout_crash_signature(seed);
    }

    let seed_clone = seed.clone();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let sig = simulator(&seed_clone);
        let _ = tx.send(sig);
    });

    match rx.recv_timeout(Duration::from_millis(config.timeout_ms)) {
        Ok(sig) => sig,
        Err(_) => timeout_crash_signature(seed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classify;
    use std::thread;
    use std::time::Duration as StdDuration;

    #[test]
    fn fast_simulator_returns_normally() {
        let seed = CaseSeed {
            id: 1,
            payload: vec![0x50],
        };
        let cfg = SimulationTimeoutConfig::new(500);
        let sig = run_simulation_with_timeout(&seed, &cfg, |s| classify(s));
        assert_ne!(sig.category, "timeout");
    }

    #[test]
    fn slow_simulator_marks_timeout() {
        let seed = CaseSeed {
            id: 2,
            payload: vec![0x40, 0x41],
        };
        let cfg = SimulationTimeoutConfig::new(30);
        let sig = run_simulation_with_timeout(&seed, &cfg, |_| {
            thread::sleep(StdDuration::from_millis(200));
            classify(&CaseSeed {
                id: 2,
                payload: vec![0x40, 0x41],
            })
        });
        assert_eq!(sig.category, "timeout");
    }

    #[test]
    fn zero_timeout_immediately_times_out() {
        let seed = CaseSeed {
            id: 3,
            payload: vec![1],
        };
        let cfg = SimulationTimeoutConfig::new(0);
        let sig = run_simulation_with_timeout(&seed, &cfg, |s| classify(s));
        assert_eq!(sig.category, "timeout");
    }

    #[test]
    fn run_metadata_surfaces_timeout() {
        let cfg = SimulationTimeoutConfig::new(1234);
        let meta = RunMetadata::from_timeout_config(&cfg);
        assert_eq!(meta.schema, RUN_METADATA_SCHEMA_VERSION);
        assert_eq!(meta.simulation_timeout_ms, 1234);
    }

    #[test]
    fn run_metadata_legacy_json_without_schema_field_loads_and_upgrades() {
        let legacy = br#"{"simulation_timeout_ms":9999}"#;
        let meta = load_run_metadata_json(legacy).expect("legacy json");
        assert_eq!(meta.schema, RUN_METADATA_SCHEMA_VERSION);
        assert_eq!(meta.simulation_timeout_ms, 9999);
    }

    #[test]
    fn run_metadata_round_trip_save_load() {
        let cfg = SimulationTimeoutConfig::new(42);
        let meta = RunMetadata::from_timeout_config(&cfg);
        let bytes = save_run_metadata_json(&meta).expect("save");
        let loaded = load_run_metadata_json(&bytes).expect("load");
        assert_eq!(loaded, meta);
    }

    #[test]
    fn run_metadata_rejects_unsupported_schema() {
        let bad = br#"{"schema":999,"simulation_timeout_ms":1}"#;
        let err = load_run_metadata_json(bad).expect_err("unsupported schema");
        match err {
            RunMetadataError::UnsupportedSchema { found } => assert_eq!(found, 999),
            RunMetadataError::Json(_) => panic!("expected UnsupportedSchema"),
        }
    }

    #[test]
    fn run_metadata_upgrade_to_current_is_idempotent_for_v1() {
        let meta = RunMetadata {
            schema: 1,
            simulation_timeout_ms: 55,
        };
        let once = meta.clone().upgrade_to_current().expect("upgrade");
        let twice = once.clone().upgrade_to_current().expect("upgrade again");
        assert_eq!(once, twice);
        assert_eq!(once.schema, RUN_METADATA_SCHEMA_VERSION);
    }
}
