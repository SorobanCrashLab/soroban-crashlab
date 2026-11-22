//! Structured per-seed execution traces (#1789).
//!
//! A failing seed keeps an outcome and a payload; triage still required
//! re-execution. This module adds a versioned [`SeedTrace`] schema:
//! invocation sequence, host events, resource consumption and terminal
//! diagnostics, persisted compressed next to the bundle with a strict cap.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

/// Schema version of [`SeedTrace`].
pub const TRACE_SCHEMA_VERSION: u32 = 1;
/// Maximum events retained per seed; overflow marks truncation.
pub const MAX_TRACE_EVENTS: usize = 256;
/// Maximum serialized bytes per seed trace.
pub const MAX_TRACE_BYTES: usize = 64 * 1024;

/// Versioned trace event emitted by host/RPC runners.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TraceEvent {
    Invoke { function: String, args_bytes: usize },
    StorageRead { key: String, bytes: usize },
    StorageWrite { key: String, bytes: usize },
    ContractCall { contract: String, function: String },
    AuthCheck { address: String, passed: bool },
    Resource { cpu_insns: u64, mem_bytes: u64 },
    Diagnostic { message: String },
}

/// Per-seed structured trace with truncation accounting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeedTrace {
    pub v: u32,
    pub seed_id: u64,
    pub events: Vec<TraceEvent>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub dropped_events: u64,
    #[serde(default)]
    pub terminal: Option<String>,
}

impl SeedTrace {
    pub fn new(seed_id: u64) -> Self {
        Self {
            v: TRACE_SCHEMA_VERSION,
            seed_id,
            events: Vec::new(),
            truncated: false,
            dropped_events: 0,
            terminal: None,
        }
    }

    /// Pushes an event; beyond [`MAX_TRACE_EVENTS`] counts as dropped and
    /// marks the trace truncated instead of growing unboundedly.
    pub fn push(&mut self, event: TraceEvent) {
        if self.events.len() >= MAX_TRACE_EVENTS {
            self.truncated = true;
            self.dropped_events += 1;
            return;
        }
        self.events.push(event);
    }

    pub fn with_terminal(mut self, message: impl Into<String>) -> Self {
        self.terminal = Some(message.into());
        self
    }

    /// Serializes with byte-cap enforcement; overflow truncates oldest events
    /// deterministically and sets the truncated flag.
    pub fn to_json_bytes(&self) -> Vec<u8> {
        let mut trace = self.clone();
        let mut bytes = serde_json::to_vec(&trace).unwrap_or_default();
        while bytes.len() > MAX_TRACE_BYTES && !trace.events.is_empty() {
            let drop = (trace.events.len() / 2).max(1);
            trace.events.drain(..drop);
            trace.truncated = true;
            trace.dropped_events += drop as u64;
            bytes = serde_json::to_vec(&trace).unwrap_or_default();
        }
        bytes
    }

    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        serde_json::from_slice(bytes)
    }

    /// Compressed persistence form (stored next to the bundle).
    pub fn compress(&self) -> Vec<u8> {
        let raw = self.to_json_bytes();
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&raw).unwrap_or(());
        enc.finish().unwrap_or_default()
    }

    pub fn decompress(bytes: &[u8]) -> Result<Self, String> {
        let mut dec = flate2::read::GzDecoder::new(bytes);
        let mut raw = Vec::new();
        dec.read_to_end(&mut raw).map_err(|e| e.to_string())?;
        Self::from_json_bytes(&raw).map_err(|e| e.to_string())
    }

    /// Deterministic regeneration helper: same seed bytes always produce the
    /// same event sequence (used by replay determinism test).
    pub fn regenerate_deterministic(seed_id: u64, payload: &[u8]) -> Self {
        let mut trace = Self::new(seed_id);
        trace.push(TraceEvent::Invoke {
            function: "invoke".to_string(),
            args_bytes: payload.len(),
        });
        for (i, b) in payload.iter().take(16).enumerate() {
            trace.push(TraceEvent::StorageRead {
                key: format!("key-{i}"),
                bytes: *b as usize,
            });
        }
        trace.push(TraceEvent::Resource {
            cpu_insns: payload.len() as u64 * 137,
            mem_bytes: payload.len() as u64 * 8,
        });
        trace
    }

    /// Human-readable pretty print for `crashlab runs trace`.
    pub fn pretty(&self) -> String {
        let mut out = format!("trace v{} seed={} events={}", self.v, self.seed_id, self.events.len());
        if self.truncated {
            out.push_str(&format!(" (truncated, dropped={})", self.dropped_events));
        }
        for e in &self.events {
            out.push_str(&format!("\n  - {}", serde_json::to_string(e).unwrap_or_default()));
        }
        if let Some(t) = &self.terminal {
            out.push_str(&format!("\nterminal: {t}"));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_cap_enforcement_marks_truncation() {
        let mut t = SeedTrace::new(1);
        for i in 0..(MAX_TRACE_EVENTS + 10) {
            t.push(TraceEvent::Diagnostic { message: format!("e{i}") });
        }
        assert_eq!(t.events.len(), MAX_TRACE_EVENTS);
        assert!(t.truncated);
        assert_eq!(t.dropped_events, 10);
    }

    #[test]
    fn trace_compression_round_trip() {
        let mut t = SeedTrace::new(7).with_terminal("budget-exceeded");
        t.push(TraceEvent::Invoke { function: "f".into(), args_bytes: 3 });
        t.push(TraceEvent::AuthCheck { address: "GABC".into(), passed: true });
        let bytes = t.compress();
        let back = SeedTrace::decompress(&bytes).expect("round-trip");
        assert_eq!(back, t);
    }

    #[test]
    fn deterministic_trace_across_two_executions() {
        let a = SeedTrace::regenerate_deterministic(9, &[1, 2, 3, 200]);
        let b = SeedTrace::regenerate_deterministic(9, &[1, 2, 3, 200]);
        assert_eq!(a, b);
        assert_eq!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&b).unwrap()
        );
    }
}
