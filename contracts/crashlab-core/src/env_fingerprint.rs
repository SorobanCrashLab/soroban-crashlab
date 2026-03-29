//! Runtime environment fingerprinting for [`CaseBundle`](crate::CaseBundle) replay.
//!
//! When a failing case is persisted, callers can attach an [`EnvironmentFingerprint`]
//! so replay tooling can detect **material** host differences (OS, CPU architecture,
//! process family) that may invalidate a strict reproduction.

use serde::{Deserialize, Serialize};
use std::env::consts::{ARCH, FAMILY, OS};

/// Snapshot of the host environment at bundle capture time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvironmentFingerprint {
    /// Operating system name (e.g. `linux`, `macos`, `windows`).
    pub os: String,
    /// CPU architecture (e.g. `x86_64`, `aarch64`).
    pub arch: String,
    /// Platform family (`unix` or `windows`).
    pub family: String,
    /// `crashlab-core` crate semantic version at capture time.
    pub tool_version: String,
}

impl EnvironmentFingerprint {
    /// Builds a fingerprint from explicit fields (tests, fixtures, imports).
    pub fn new(
        os: impl Into<String>,
        arch: impl Into<String>,
        family: impl Into<String>,
        tool_version: impl Into<String>,
    ) -> Self {
        Self {
            os: os.into(),
            arch: arch.into(),
            family: family.into(),
            tool_version: tool_version.into(),
        }
    }

    /// Captures the current process environment using [`std::env::consts`].
    pub fn capture() -> Self {
        Self {
            os: OS.to_string(),
            arch: ARCH.to_string(),
            family: FAMILY.to_string(),
            tool_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

/// Outcome of comparing a recorded fingerprint to the current environment before replay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayEnvironmentReport {
    /// `true` when OS, architecture, or platform family differs — replay may not be equivalent.
    pub material_mismatch: bool,
    /// Human-readable warnings suitable for logs or CLI output.
    pub warnings: Vec<String>,
}

/// Compares `recorded` (from a persisted bundle) with `current` (captured at replay time).
///
/// Returns no warnings when `recorded` is [`None`] (legacy bundles without fingerprinting).
///
/// A **material** difference is a mismatch on `os`, `arch`, or `family`. A different
/// [`EnvironmentFingerprint::tool_version`] alone is not treated as material: the same
/// host can reproduce across minor crate upgrades, but OS/arch changes often imply ABI or
/// runtime divergence.
pub fn check_replay_environment(
    recorded: Option<&EnvironmentFingerprint>,
    current: &EnvironmentFingerprint,
) -> ReplayEnvironmentReport {
    let mut warnings = Vec::new();

    let Some(rec) = recorded else {
        return ReplayEnvironmentReport {
            material_mismatch: false,
            warnings,
        };
    };

    let mut material = false;

    if rec.os != current.os {
        material = true;
        warnings.push(format!(
            "replay environment mismatch: recorded os '{}' differs from current '{}'",
            rec.os, current.os
        ));
    }
    if rec.arch != current.arch {
        material = true;
        warnings.push(format!(
            "replay environment mismatch: recorded arch '{}' differs from current '{}'",
            rec.arch, current.arch
        ));
    }
    if rec.family != current.family {
        material = true;
        warnings.push(format!(
            "replay environment mismatch: recorded family '{}' differs from current '{}'",
            rec.family, current.family
        ));
    }

    ReplayEnvironmentReport {
        material_mismatch: material,
        warnings,
    }
}

/// Runs [`check_replay_environment`] using the optional fingerprint stored on `bundle`.
pub fn check_bundle_replay_environment(
    bundle: &crate::CaseBundle,
    current: &EnvironmentFingerprint,
) -> ReplayEnvironmentReport {
    check_replay_environment(bundle.environment.as_ref(), current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_matches_consts() {
        let fp = EnvironmentFingerprint::capture();
        assert_eq!(fp.os, OS);
        assert_eq!(fp.arch, ARCH);
        assert_eq!(fp.family, FAMILY);
        assert_eq!(fp.tool_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn no_recorded_fingerprint_yields_no_warnings() {
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_replay_environment(None, &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn identical_recorded_and_current_is_clean() {
        let fp = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&fp), &fp.clone());
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn os_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("windows", "x86_64", "windows", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("os")));
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("linux") && w.contains("windows")));
    }

    #[test]
    fn arch_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "aarch64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("arch")));
    }

    #[test]
    fn family_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "x86_64", "windows", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("family")));
    }

    #[test]
    fn tool_version_only_difference_is_not_material() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "9.9.9");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn multiple_material_fields_produce_multiple_warnings() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("macos", "aarch64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.len() >= 2);
    }

    #[test]
    fn check_bundle_delegates_to_recorded_environment() {
        use crate::{CaseBundle, CaseSeed, CrashSignature};

        let seed = CaseSeed {
            id: 1,
            payload: vec![1],
        };
        let recorded_fp = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let bundle = CaseBundle {
            seed,
            signature: CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: Some(recorded_fp.clone()),
            failure_payload: Vec::new(),
            rpc_envelope: None,
        };

        let current = EnvironmentFingerprint::new("windows", "x86_64", "windows", "0.1.0");
        let report = check_bundle_replay_environment(&bundle, &current);
        assert!(report.material_mismatch);
        assert!(!report.warnings.is_empty());
    }

    #[test]
    fn bundle_without_environment_behaves_like_none() {
        use crate::{CaseBundle, CaseSeed, CrashSignature};

        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 1,
                payload: vec![1],
            },
            signature: CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: None,
            failure_payload: Vec::new(),
            rpc_envelope: None,
        };
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_bundle_replay_environment(&bundle, &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
    }
}
