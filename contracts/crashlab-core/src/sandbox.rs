//! Per-seed resource sandbox with deterministic kill classification (#1791).
//!
//! A hostile fixture must not pin a worker: each seed runs under a wall-clock
//! deadline, a host-function recursion budget and an XDR decode size cap.
//! Kills classify deterministically as `sandbox_timeout` / `sandbox_memory` /
//! `sandbox_depth` (plus `sandbox_input` for oversized XDR) — distinct from
//! contract-observed budget exhaustion — and stable enough to replay.
//! Sandbox classes are harness-health signals, excluded from "contract bug"
//! dashboards (see [`SandboxKill::is_contract_bug`]).

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Default per-seed wall-clock deadline (preset default, overridable per run).
pub const DEFAULT_SEED_DEADLINE: Duration = Duration::from_millis(500);
/// Maximum host-function recursion depth before `sandbox_depth`.
pub const MAX_HOST_RECURSION_DEPTH: u32 = 64;
/// Maximum XDR decode size before `sandbox_input`.
pub const MAX_XDR_DECODE_BYTES: usize = 64 * 1024;
/// Cooperative-check granularity hint (runners poll remaining budget).
pub const SANDBOX_POLL_EVERY_SEEDS: u64 = 1;

/// Deterministic sandbox kill classes. Stable strings are persisted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxKill {
    SandboxTimeout,
    SandboxMemory,
    SandboxDepth,
    SandboxInput,
}

impl SandboxKill {
    pub fn as_str(self) -> &'static str {
        match self {
            SandboxKill::SandboxTimeout => "sandbox_timeout",
            SandboxKill::SandboxMemory => "sandbox_memory",
            SandboxKill::SandboxDepth => "sandbox_depth",
            SandboxKill::SandboxInput => "sandbox_input",
        }
    }

    /// Sandbox kills are harness health, never contract bugs.
    pub fn is_contract_bug(self) -> bool {
        false
    }
}

impl std::fmt::Display for SandboxKill {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Per-seed sandbox limits (preset default, per-run override).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub wall_clock_ms: u64,
    pub max_recursion_depth: u32,
    pub max_xdr_bytes: usize,
    pub memory_cap_bytes: Option<u64>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            wall_clock_ms: DEFAULT_SEED_DEADLINE.as_millis() as u64,
            max_recursion_depth: MAX_HOST_RECURSION_DEPTH,
            max_xdr_bytes: MAX_XDR_DECODE_BYTES,
            // Host memory caps enforced where the host allows; None documents
            // the limitation and relies on wall-clock + depth guards.
            memory_cap_bytes: None,
        }
    }
}

impl SandboxConfig {
    pub fn with_deadline(mut self, d: Duration) -> Self {
        self.wall_clock_ms = d.as_millis() as u64;
        self
    }

    pub fn deadline(&self) -> Duration {
        Duration::from_millis(self.wall_clock_ms)
    }

    /// Pre-execution gate: oversized XDR input fails fast as `sandbox_input`
    /// without executing; excessive declared depth fails as `sandbox_depth`.
    pub fn check_input(&self, payload_len: usize, declared_depth: u32) -> Result<(), SandboxKill> {
        if payload_len > self.max_xdr_bytes {
            return Err(SandboxKill::SandboxInput);
        }
        if declared_depth > self.max_recursion_depth {
            return Err(SandboxKill::SandboxDepth);
        }
        Ok(())
    }

    /// Post-execution classification of an elapsed run (replay-stable: same
    /// inputs → same class; ties to #1582 timeout round-trip).
    pub fn classify_elapsed(&self, elapsed: Duration, peak_mem_bytes: Option<u64>) -> Option<SandboxKill> {
        if elapsed >= self.deadline() {
            return Some(SandboxKill::SandboxTimeout);
        }
        if let (Some(peak), Some(cap)) = (peak_mem_bytes, self.memory_cap_bytes) {
            if peak > cap {
                return Some(SandboxKill::SandboxMemory);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pathological_recursion_hits_depth_class() {
        let cfg = SandboxConfig::default();
        assert_eq!(
            cfg.check_input(16, MAX_HOST_RECURSION_DEPTH + 1),
            Err(SandboxKill::SandboxDepth)
        );
    }

    #[test]
    fn pathological_xdr_hits_input_class() {
        let cfg = SandboxConfig::default();
        assert_eq!(
            cfg.check_input(MAX_XDR_DECODE_BYTES + 1, 1),
            Err(SandboxKill::SandboxInput)
        );
    }

    #[test]
    fn over_deadline_hits_timeout_within_small_delta() {
        let cfg = SandboxConfig::default().with_deadline(Duration::from_millis(50));
        let kill = cfg.classify_elapsed(Duration::from_millis(60), None);
        assert_eq!(kill, Some(SandboxKill::SandboxTimeout));
        // Replay reproduces the same class.
        assert_eq!(cfg.classify_elapsed(Duration::from_millis(60), None), kill);
    }

    #[test]
    fn memory_cap_breach_hits_memory_class() {
        let cfg = SandboxConfig {
            memory_cap_bytes: Some(1024),
            ..SandboxConfig::default()
        };
        assert_eq!(
            cfg.classify_elapsed(Duration::from_millis(1), Some(2048)),
            Some(SandboxKill::SandboxMemory)
        );
    }

    #[test]
    fn sandbox_kills_are_not_contract_bugs() {
        for k in [
            SandboxKill::SandboxTimeout,
            SandboxKill::SandboxMemory,
            SandboxKill::SandboxDepth,
            SandboxKill::SandboxInput,
        ] {
            assert!(!k.is_contract_bug());
        }
    }
}
