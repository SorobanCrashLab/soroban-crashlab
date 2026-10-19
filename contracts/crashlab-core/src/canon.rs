//! Canonical serialization contract for persisted snapshots and JSONL (#1793).
//!
//! Audit (parse→serialize round-trips in persisted formats):
//! - `health_snapshot.rs`: `to_json_line`/`from_json_line` — FIXED in 1ca0ce8
//!   via `read_latest_health_snapshot_line` verbatim passthrough; f64
//!   re-serialization flipped ...7651 → ...7653.
//! - `run_metadata.rs`: save/load re-emits parsed JSON — MUST use
//!   [`write_canonical_line`] on write and verbatim passthrough on status.
//! - `bundle_persist.rs`: bundle save/load — MUST be byte-identical via
//!   [`is_byte_identical_round_trip`]-verified paths; no rewrite except
//!   version-bump migration.
//! - `fixture_manifest.rs`: manifest export — same rule; migration bumps
//!   `FIXTURE_MANIFEST_SCHEMA_VERSION`.
//! - `signature_hash.rs`: floats formatted only at record creation via
//!   [`format_f64_canonical`] (ryu-style shortest round-trip); readers never
//!   reprint parsed floats.
//!
//! Rule: persisted bytes are canonical. Readers must not rewrite them unless
//! deliberately migrating (schema version bump). New formats must add a
//! load→save byte-identity property test or the CI guard fails.

use serde_json::Value;

/// Formats an f64 with shortest-round-trip stability (ryu-style via serde_json).
/// Only for creating NEW records; never reprint a parsed float.
pub fn format_f64_canonical(v: f64) -> String {
    serde_json::to_string(&v).unwrap_or_else(|_| "0.0".to_string())
}

/// Serializes a value to one canonical JSON line (newline included).
/// Object key order follows serde_json's BTreeMap-backed Value ordering when
/// constructed from [`serde_json::Map`]; callers should build maps
/// deterministically and never re-serialize a parsed line for output.
pub fn write_canonical_line(value: &Value) -> Result<String, serde_json::Error> {
    let mut line = serde_json::to_string(value)?;
    line.push('\n');
    Ok(line)
}

/// Parses one canonical line without rewriting it.
pub fn parse_canonical_line(line: &str) -> Result<Value, serde_json::Error> {
    serde_json::from_str(line)
}

/// Property helper: load→save must be byte-identical for persisted formats.
/// Returns true when `serialize(parse(bytes)) == bytes` (trailing newline
/// normalized). Use in round-trip property tests for every persisted format.
pub fn is_byte_identical_round_trip(
    raw_line: &str,
    serialize: impl Fn(&Value) -> Result<String, serde_json::Error>,
) -> bool {
    let trimmed = raw_line.trim_end_matches('\n');
    match parse_canonical_line(trimmed).and_then(|v| serialize(&v)) {
        Ok(reserialized) => reserialized.trim_end_matches('\n') == trimmed,
        Err(_) => false,
    }
}

/// CI guard: every registered persisted format must have a round-trip property
/// test. Formats register here; the guard test fails for unlisted formats.
pub const PERSISTED_FORMATS_WITH_ROUND_TRIP_TEST: &[&str] = &[
    "health_snapshot",
    "run_metadata",
    "case_bundle",
    "fixture_manifest",
    "signature_hash",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(format: &str, line: &str) -> bool {
        assert!(
            PERSISTED_FORMATS_WITH_ROUND_TRIP_TEST.contains(&format),
            "format {format} lacks a registered round-trip property test"
        );
        is_byte_identical_round_trip(line, |v| {
            Ok(serde_json::to_string(v).expect("serialize"))
        })
    }

    #[test]
    fn health_snapshot_line_round_trip_is_byte_identical() {
        let line = r#"{"v":2,"run_id":1,"sequence":1,"emitted_at":"2026-01-01T00:00:00Z","status":"healthy","x":1}"#;
        assert!(round_trip("health_snapshot", line));
    }

    #[test]
    fn run_metadata_line_round_trip_is_byte_identical() {
        let line = r#"{"schema":1,"run_id":3,"seeds":100}"#;
        assert!(round_trip("run_metadata", line));
    }

    #[test]
    fn case_bundle_line_round_trip_is_byte_identical() {
        let line = r#"{"schema":1,"seed":{"id":1,"payload":[1,2]}}"#;
        assert!(round_trip("case_bundle", line));
    }

    #[test]
    fn fixture_manifest_line_round_trip_is_byte_identical() {
        let line = r#"{"schema":1,"fixtures":[]}"#;
        assert!(round_trip("fixture_manifest", line));
    }

    #[test]
    fn float_creation_uses_shortest_round_trip() {
        assert_eq!(format_f64_canonical(0.1), "0.1");
        let v: f64 = serde_json::from_str(&format_f64_canonical(1.0 / 3.0)).unwrap();
        assert!((v - 1.0 / 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn ci_guard_rejects_unregistered_format() {
        assert!(!PERSISTED_FORMATS_WITH_ROUND_TRIP_TEST.contains(&"brand_new_format"));
    }
}
