//! Host function coverage matrix (#1790).
//!
//! Answers "has this campaign ever exercised require_auth_for_args /
//! update_current_contract_wasm / storage TTL extension?" Coverage is
//! aggregated per run (not per seed) to bound cardinality to O(#host
//! functions). Snapshots carry it in health JSON; `crashlab runs status
//! --coverage` renders the exercised/unexercised matrix.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Reference surface of Soroban host functions tracked by CrashLab.
/// Fixed list keeps the coverage struct O(#host functions).
pub const HOST_FUNCTION_SURFACE: &[&str] = &[
    "require_auth_for_args",
    "require_auth",
    "update_current_contract_wasm",
    "extend_ttl",
    "restore_footprint",
    "storage_put",
    "storage_get",
    "storage_del",
    "storage_has",
    "call_contract",
    "create_contract",
    "emit_event",
    "budget_consume",
    "prng_seed",
    "prng_bytes",
];

/// Per-campaign aggregated host-function invocation counts.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostCoverage {
    /// Counts keyed by host function name; only exercised functions present.
    #[serde(default)]
    pub counts: BTreeMap<String, u64>,
}

impl HostCoverage {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records one invocation of `function`. Unknown names are still counted
    /// (forward-compatible with host surface growth) but the reference matrix
    /// only reports [`HOST_FUNCTION_SURFACE`] rows.
    pub fn record(&mut self, function: &str) {
        *self.counts.entry(function.to_string()).or_insert(0) += 1;
    }

    pub fn exercised(&self, function: &str) -> bool {
        self.counts.get(function).is_some_and(|c| *c > 0)
    }

    /// Reference matrix rows: (function, exercised, count) for every known
    /// host function, suitable for diffing across campaigns.
    pub fn matrix(&self) -> Vec<(String, bool, u64)> {
        HOST_FUNCTION_SURFACE
            .iter()
            .map(|f| {
                let c = self.counts.get(*f).copied().unwrap_or(0);
                (f.to_string(), c > 0, c)
            })
            .collect()
    }

    pub fn exercised_count(&self) -> usize {
        self.matrix().iter().filter(|(_, e, _)| *e).count()
    }

    /// Merges another run's coverage (campaign-level aggregation).
    pub fn merge(&mut self, other: &HostCoverage) {
        for (k, v) in &other.counts {
            *self.counts.entry(k.clone()).or_insert(0) += v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixtures_targeting_distinct_host_functions_produce_expected_rows() {
        let mut cov = HostCoverage::new();
        cov.record("require_auth_for_args");
        cov.record("require_auth_for_args");
        cov.record("extend_ttl");
        cov.record("storage_put");
        let rows: BTreeMap<_, _> = cov
            .matrix()
            .into_iter()
            .map(|(f, e, c)| (f, (e, c)))
            .collect();
        assert_eq!(rows["require_auth_for_args"], (true, 2));
        assert_eq!(rows["extend_ttl"], (true, 1));
        assert_eq!(rows["storage_put"], (true, 1));
        assert_eq!(rows["update_current_contract_wasm"], (false, 0));
    }

    #[test]
    fn cardinality_bounded_by_host_surface_plus_seen() {
        let mut cov = HostCoverage::new();
        for i in 0..10_000 {
            cov.record(HOST_FUNCTION_SURFACE[i % HOST_FUNCTION_SURFACE.len()]);
        }
        assert!(cov.counts.len() <= HOST_FUNCTION_SURFACE.len());
        assert_eq!(cov.matrix().len(), HOST_FUNCTION_SURFACE.len());
    }
}
