//! Mutation engine version pinning.
//!
//! The PRNG stream layout and mutator ordering form the de-facto schema of
//! every replay. This module pins that layout behind a semver engine version
//! so corpus invalidation is explicit instead of silent.

/// Current mutation engine version (tracks crate version).
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Parses `major.minor.patch` into a triple; unknown maps to 0.0.0.
pub fn parse_version(v: &str) -> (u64, u64, u64) {
    let mut parts = v.split('.');
    let major = parts
        .next()
        .unwrap_or("0")
        .parse::<u64>()
        .unwrap_or(0);
    let minor = parts
        .next()
        .unwrap_or("0")
        .parse::<u64>()
        .unwrap_or(0);
    let patch = parts
        .next()
        .unwrap_or("0")
        .split('-')
        .next()
        .unwrap_or("0")
        .parse::<u64>()
        .unwrap_or(0);
    (major, minor, patch)
}

/// Drift class between bundle and current engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineDrift {
    /// Same version.
    None,
    /// Patch-only difference; replay allowed.
    Patch,
    /// Minor difference; replay allowed with warning, N-1 window.
    Minor,
    /// Major difference or unparseable; replay refused without override.
    Major,
}

/// Classifies drift between `bundle` and `current` engine versions.
pub fn drift_class(bundle: &str, current: &str) -> EngineDrift {
    if bundle == current {
        return EngineDrift::None;
    }
    if bundle.is_empty() || bundle == "unknown" {
        return EngineDrift::Major;
    }
    let (bmaj, bmin, bpatch) = parse_version(bundle);
    let (cmaj, cmin, cpatch) = parse_version(current);
    if bmaj != cmaj {
        EngineDrift::Major
    } else if bmin != cmin {
        EngineDrift::Minor
    } else if bpatch != cpatch {
        EngineDrift::Patch
    } else {
        EngineDrift::None
    }
}

/// Returns true when replay must be refused without explicit override.
pub fn requires_override(bundle: &str, current: &str) -> bool {
    matches!(drift_class(bundle, current), EngineDrift::Major)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_version_has_no_drift() {
        assert_eq!(drift_class("0.1.0", "0.1.0"), EngineDrift::None);
        assert!(!requires_override("0.1.0", "0.1.0"));
    }

    #[test]
    fn unknown_bundle_is_major_drift() {
        assert_eq!(drift_class("unknown", ENGINE_VERSION), EngineDrift::Major);
        assert!(requires_override("unknown", ENGINE_VERSION));
    }

    #[test]
    fn major_bump_requires_override() {
        assert_eq!(drift_class("1.0.0", "2.0.0"), EngineDrift::Major);
    }

    #[test]
    fn minor_bump_warns_only() {
        assert_eq!(drift_class("0.1.0", "0.2.0"), EngineDrift::Minor);
        assert!(!requires_override("0.1.0", "0.2.0"));
    }
}
