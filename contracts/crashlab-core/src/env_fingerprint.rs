//! Runtime environment fingerprinting for [`CaseBundle`](crate::CaseBundle) replay.
//!
//! When a failing case is persisted, callers can attach an [`EnvironmentFingerprint`]
//! so replay tooling can detect **material** host differences (OS, CPU architecture,
//! process family) that may invalidate a strict reproduction, and can *name* every
//! other axis on which two platforms legitimately differ (#1799).
//!
//! # Axes
//!
//! | Axis | Material when it differs? | Why |
//! |---|---|---|
//! | `os` | **yes** | Flagged so a cross-OS divergence is explained, never silent |
//! | `arch` | **yes** | ABI and numeric widening can differ |
//! | `family` | **yes** | `unix` vs `windows` implies path and process model differences |
//! | `tool_version` | no | Documented version window (reproducibility contract §4) |
//! | `endian` | no | Byte order is documented as non-material (§3) |
//! | `pointer_width` | no | Documented as non-material (§3) |
//! | `path_separator` | no | Documented as non-material (§3) |
//!
//! Fingerprints built with [`EnvironmentFingerprint::new`] (tests, fixtures,
//! imported bundles) and bundles written before #1799 leave the extended axes
//! **unspecified** — an empty string. An axis that either side did not record is
//! skipped rather than reported as a difference, so legacy bundles keep replaying
//! without noise.
//!
//! Time and locale are deliberately *not* captured: they vary with **when** a
//! bundle was written rather than with which platform replays it, and the engine
//! paths they can reach are documented nondeterminism instead of part of the
//! replay contract (`docs/reproducibility-contract.md` §5).
//!
//! Every difference — material or documented — is reported by name in
//! [`ReplayEnvironmentReport::differing_axes`] and as a human-readable warning,
//! so replay never fails or succeeds silently on a platform axis (#1799).

use serde::{Deserialize, Serialize};
use std::env::consts::{ARCH, FAMILY, OS};

/// One environment axis recorded by [`EnvironmentFingerprint`].
///
/// Variants are declared in the canonical order used for comparison and for the
/// `differing_axes` report, so two reports are comparable field by field.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayAxis {
    /// Operating system (`linux`, `macos`, `windows`, ...).
    Os,
    /// CPU architecture (`x86_64`, `aarch64`, ...).
    Arch,
    /// Platform family (`unix` or `windows`).
    Family,
    /// Byte order (`little` or `big`).
    Endian,
    /// Pointer width in bits (`32` or `64`).
    PointerWidth,
    /// Path separator (`/` or `\`).
    PathSeparator,
    /// `crashlab-core` crate version at capture time.
    ToolVersion,
}

impl ReplayAxis {
    /// Every axis, in canonical comparison and reporting order.
    pub const ALL: [ReplayAxis; 7] = [
        ReplayAxis::Os,
        ReplayAxis::Arch,
        ReplayAxis::Family,
        ReplayAxis::Endian,
        ReplayAxis::PointerWidth,
        ReplayAxis::PathSeparator,
        ReplayAxis::ToolVersion,
    ];

    /// Stable axis name used in warnings, machine-readable reports and CI logs.
    pub fn as_str(self) -> &'static str {
        match self {
            ReplayAxis::Os => "os",
            ReplayAxis::Arch => "arch",
            ReplayAxis::Family => "family",
            ReplayAxis::Endian => "endian",
            ReplayAxis::PointerWidth => "pointer_width",
            ReplayAxis::PathSeparator => "path_separator",
            ReplayAxis::ToolVersion => "tool_version",
        }
    }

    /// `true` when a difference on this axis sets
    /// [`ReplayEnvironmentReport::material_mismatch`].
    ///
    /// OS, architecture and family are material: they are exactly the axes a
    /// responder must be told about when a reproducer was captured elsewhere.
    /// The remaining axes are documented as benign for class + signature replay
    /// (reproducibility contract §3/§4): they are reported as warnings, but a
    /// difference on them alone never marks the replay as materially divergent.
    pub fn is_material(self) -> bool {
        matches!(
            self,
            ReplayAxis::Os | ReplayAxis::Arch | ReplayAxis::Family
        )
    }

    /// The section of `docs/reproducibility-contract.md` that documents this axis.
    pub fn contract_reference(self) -> &'static str {
        match self {
            ReplayAxis::ToolVersion => "docs/reproducibility-contract.md §4",
            _ => "docs/reproducibility-contract.md §3",
        }
    }
}

impl std::fmt::Display for ReplayAxis {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Snapshot of the host environment at bundle capture time.
///
/// `endian`, `pointer_width` and `path_separator` were added by #1799; they are
/// optional on the wire so bundles written by older engine versions still load.
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
    /// Byte order of the capture host (`little` / `big`), empty when unspecified.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub endian: String,
    /// Pointer width of the capture host in bits (`32` / `64`), empty when unspecified.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub pointer_width: String,
    /// Path separator of the capture host (`/` or `\`), empty when unspecified.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub path_separator: String,
}

impl EnvironmentFingerprint {
    /// Builds a fingerprint from explicit fields (tests, fixtures, imports).
    ///
    /// The extended axes (`endian`, `pointer_width`, `path_separator`) are left
    /// unspecified: they describe the *capturing host*, which a caller supplying
    /// values by hand may not be running on. Use [`EnvironmentFingerprint::capture`]
    /// to record them, and unspecified axes are skipped when comparing.
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
            endian: String::new(),
            pointer_width: String::new(),
            path_separator: String::new(),
        }
    }

    /// Captures the current process environment using [`std::env::consts`] and
    /// the compile-time target properties of this build.
    pub fn capture() -> Self {
        Self {
            os: OS.to_string(),
            arch: ARCH.to_string(),
            family: FAMILY.to_string(),
            tool_version: env!("CARGO_PKG_VERSION").to_string(),
            endian: if cfg!(target_endian = "big") {
                "big"
            } else {
                "little"
            }
            .to_string(),
            pointer_width: usize::BITS.to_string(),
            path_separator: std::path::MAIN_SEPARATOR_STR.to_string(),
        }
    }

    /// The value recorded for `axis`, or an empty string when unspecified.
    pub fn axis_value(&self, axis: ReplayAxis) -> &str {
        match axis {
            ReplayAxis::Os => &self.os,
            ReplayAxis::Arch => &self.arch,
            ReplayAxis::Family => &self.family,
            ReplayAxis::Endian => &self.endian,
            ReplayAxis::PointerWidth => &self.pointer_width,
            ReplayAxis::PathSeparator => &self.path_separator,
            ReplayAxis::ToolVersion => &self.tool_version,
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
    /// Every axis on which the two fingerprints differ, in canonical order.
    ///
    /// Material and documented axes are both listed, so a caller can name the
    /// differing axis even when `material_mismatch` is `false` (#1799).
    pub differing_axes: Vec<ReplayAxis>,
}

impl ReplayEnvironmentReport {
    /// Comma-separated axis names (e.g. `"os, tool_version"`), empty when the
    /// fingerprints agree on every recorded axis.
    pub fn differing_axis_names(&self) -> String {
        self.differing_axes
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// Compares `recorded` (from a persisted bundle) with `current` (captured at replay time).
///
/// Returns no warnings when `recorded` is [`None`] (legacy bundles without fingerprinting).
/// An axis that either side left unspecified is skipped — absence of a value is
/// not a difference.
///
/// A **material** difference is a mismatch on `os`, `arch`, or `family`. A different
/// [`EnvironmentFingerprint::tool_version`], `endian`, `pointer_width` or
/// `path_separator` alone is not treated as material: the same host can reproduce
/// across minor crate upgrades and these axes are documented as benign
/// (reproducibility contract §3/§4), but each one still produces a warning that
/// names the axis, so a legitimate platform difference is never silent (#1799).
pub fn check_replay_environment(
    recorded: Option<&EnvironmentFingerprint>,
    current: &EnvironmentFingerprint,
) -> ReplayEnvironmentReport {
    let mut warnings = Vec::new();
    let mut differing_axes = Vec::new();

    let Some(rec) = recorded else {
        return ReplayEnvironmentReport {
            material_mismatch: false,
            warnings,
            differing_axes,
        };
    };

    let mut material = false;

    for axis in ReplayAxis::ALL {
        let recorded_value = rec.axis_value(axis);
        let current_value = current.axis_value(axis);
        if recorded_value.is_empty() || current_value.is_empty() || recorded_value == current_value {
            continue;
        }

        differing_axes.push(axis);
        material |= axis.is_material();

        let severity = if axis.is_material() {
            "mismatch"
        } else {
            "difference"
        };
        let classification = if axis.is_material() {
            "material axis"
        } else {
            "documented, non-material axis"
        };
        warnings.push(format!(
            "replay environment {severity}: recorded {axis} '{recorded_value}' differs from current '{current_value}' ({classification}; {})",
            axis.contract_reference()
        ));
    }

    ReplayEnvironmentReport {
        material_mismatch: material,
        warnings,
        differing_axes,
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
    fn capture_records_extended_axes() {
        let fp = EnvironmentFingerprint::capture();
        assert_eq!(fp.endian, if cfg!(target_endian = "big") { "big" } else { "little" });
        assert_eq!(fp.pointer_width, usize::BITS.to_string());
        assert_eq!(fp.path_separator, std::path::MAIN_SEPARATOR_STR);
    }

    #[test]
    fn new_leaves_extended_axes_unspecified() {
        let fp = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        assert!(fp.endian.is_empty());
        assert!(fp.pointer_width.is_empty());
        assert!(fp.path_separator.is_empty());
    }

    #[test]
    fn fingerprint_round_trips_through_json() {
        let fp = EnvironmentFingerprint::capture();
        let json = serde_json::to_string(&fp).expect("serialize");
        let parsed: EnvironmentFingerprint = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed, fp);
    }

    #[test]
    fn legacy_fingerprint_json_without_extended_axes_parses() {
        let json = r#"{"os":"linux","arch":"x86_64","family":"unix","tool_version":"0.0.9"}"#;
        let fp: EnvironmentFingerprint = serde_json::from_str(json).expect("legacy fingerprint");
        assert_eq!(fp.os, "linux");
        assert!(fp.endian.is_empty());
        assert!(fp.pointer_width.is_empty());
        assert!(fp.path_separator.is_empty());
    }

    #[test]
    fn no_recorded_fingerprint_yields_no_warnings() {
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_replay_environment(None, &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
        assert!(report.differing_axes.is_empty());
    }

    #[test]
    fn identical_recorded_and_current_is_clean() {
        let fp = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&fp), &fp.clone());
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
        assert!(report.differing_axes.is_empty());
    }

    #[test]
    fn unspecified_axes_are_skipped_not_reported_as_differences() {
        // A fingerprint built with `new` records no extended axes; comparing it
        // with a fully captured one must not report the missing values.
        let recorded = EnvironmentFingerprint::new(
            std::env::consts::OS,
            std::env::consts::ARCH,
            std::env::consts::FAMILY,
            env!("CARGO_PKG_VERSION"),
        );
        let current = EnvironmentFingerprint::capture();
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
        assert!(report.differing_axes.is_empty());
    }

    #[test]
    fn os_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        // Only the OS differs; arch and family are held constant so the report
        // names exactly one axis.
        let current = EnvironmentFingerprint::new("windows", "x86_64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("os")));
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("linux") && w.contains("windows")));
        assert_eq!(report.differing_axes, vec![ReplayAxis::Os]);
    }

    #[test]
    fn arch_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "aarch64", "unix", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("arch")));
        assert_eq!(report.differing_axes, vec![ReplayAxis::Arch]);
    }

    #[test]
    fn family_mismatch_is_material_and_warns() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "x86_64", "windows", "0.1.0");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("family")));
        assert_eq!(report.differing_axes, vec![ReplayAxis::Family]);
    }

    #[test]
    fn tool_version_only_difference_warns_but_is_not_material() {
        let recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "9.9.9");
        let report = check_replay_environment(Some(&recorded), &current);
        assert!(!report.material_mismatch);
        // Documented, but never silent: the axis is named for the responder.
        assert_eq!(report.differing_axes, vec![ReplayAxis::ToolVersion]);
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("tool_version") && w.contains("0.1.0") && w.contains("9.9.9")));
        assert!(report.warnings.iter().any(|w| w.contains("§4")));
    }

    #[test]
    fn extended_axis_differences_are_documented_and_non_material() {
        for (recorded_value, current_value, axis) in [
            ("big", "little", ReplayAxis::Endian),
            ("32", "64", ReplayAxis::PointerWidth),
            ("\\", "/", ReplayAxis::PathSeparator),
        ] {
            let mut recorded = EnvironmentFingerprint::capture();
            let mut current = EnvironmentFingerprint::capture();
            set_axis(&mut recorded, axis, recorded_value);
            set_axis(&mut current, axis, current_value);

            let report = check_replay_environment(Some(&recorded), &current);
            assert!(!report.material_mismatch, "{axis} must not be material");
            assert_eq!(report.differing_axes, vec![axis]);
            assert!(
                report.warnings.iter().any(|w| {
                    w.contains(axis.as_str())
                        && w.contains(recorded_value)
                        && w.contains(current_value)
                }),
                "warning must name the {axis} axis: {:?}",
                report.warnings
            );
            assert!(report.warnings.iter().any(|w| w.contains("non-material")));
        }
    }

    fn set_axis(fp: &mut EnvironmentFingerprint, axis: ReplayAxis, value: &str) {
        match axis {
            ReplayAxis::Os => fp.os = value.to_string(),
            ReplayAxis::Arch => fp.arch = value.to_string(),
            ReplayAxis::Family => fp.family = value.to_string(),
            ReplayAxis::Endian => fp.endian = value.to_string(),
            ReplayAxis::PointerWidth => fp.pointer_width = value.to_string(),
            ReplayAxis::PathSeparator => fp.path_separator = value.to_string(),
            ReplayAxis::ToolVersion => fp.tool_version = value.to_string(),
        }
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
    fn differing_axes_follow_canonical_order() {
        let mut recorded = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        recorded.endian = "big".to_string();
        recorded.path_separator = "/".to_string();
        let mut current = EnvironmentFingerprint::new("macos", "aarch64", "unix", "0.1.0");
        current.endian = "little".to_string();
        current.path_separator = "\\".to_string();

        let report = check_replay_environment(Some(&recorded), &current);
        assert_eq!(
            report.differing_axes,
            vec![ReplayAxis::Os, ReplayAxis::Arch, ReplayAxis::Endian, ReplayAxis::PathSeparator]
        );
        assert_eq!(report.differing_axis_names(), "os, arch, endian, path_separator");
        assert!(report.material_mismatch);
        assert_eq!(report.warnings.len(), report.differing_axes.len());
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
        engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
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
        engine_version: crate::engine_version::ENGINE_VERSION.to_string(),
        };
        let current = EnvironmentFingerprint::new("linux", "x86_64", "unix", "0.1.0");
        let report = check_bundle_replay_environment(&bundle, &current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
        assert!(report.differing_axes.is_empty());
    }
}
