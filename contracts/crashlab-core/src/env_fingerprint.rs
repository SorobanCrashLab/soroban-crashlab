//! Runtime environment fingerprinting for [`CaseBundle`](crate::CaseBundle) replay.

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
}
