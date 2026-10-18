use serde::{Deserialize, Serialize};
use std::fmt;

pub const RUN_METADATA_SCHEMA_VERSION: u32 = 1;
pub const SUPPORTED_METADATA_SCHEMAS: &[u32] = &[RUN_METADATA_SCHEMA_VERSION];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunMetadata {
    pub schema: u32,
    pub timeout_ms: u64,
    pub name: String,
    /// Campaign / run identifier for provenance linking (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    /// Engine (crate) version that produced the run (#1864).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    /// Hex-encoded hash of the run's environment fingerprint (#1864, W5-B08).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_fingerprint_hash: Option<String>,
    /// Optional suite run history entries attached to this metadata document.
    /// Skipped when empty so older consumers remain bit-compatible.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub suite_history: Vec<SuiteRunRecord>,
}

/// A single persisted execution of a regression suite.
///
/// This is the browsable history unit: it captures when a run started, how
/// long it took, per-group pass/fail counts, and the classification deltas that
/// W5-G01 produces (fixed / regressed fixtures).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SuiteRunRecord {
    pub run_id: String,
    pub suite: String,
    /// Unix epoch milliseconds when the run started.
    pub started_at_ms: u64,
    /// Wall-clock duration of the run in milliseconds.
    pub duration_ms: u64,
    pub groups: Vec<GroupResult>,
    pub classification_delta: ClassificationDelta,
    /// Optional git ref (branch/sha) the run was executed against.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GroupResult {
    pub group: String,
    pub passed: u32,
    pub failed: u32,
    /// Fixture identifiers that failed in this group, sorted for canonical
    /// output (W5-B01).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub failed_fixtures: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassificationDelta {
    /// Fixtures that went from failing to passing since the previous run.
    pub fixed: Vec<String>,
    /// Fixtures that went from passing to failing since the previous run.
    pub regressed: Vec<String>,
    /// Fixtures that were newly added and failed on their first run.
    pub newly_failing: Vec<String>,
}

impl Default for ClassificationDelta {
    fn default() -> Self {
        Self {
            fixed: Vec::new(),
            regressed: Vec::new(),
            newly_failing: Vec::new(),
        }
    }
}

#[derive(Debug)]
pub enum MetadataPersistError {
    Json(serde_json::Error),
    UnsupportedSchema { found: u32 },
}

impl fmt::Display for MetadataPersistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MetadataPersistError::Json(e) => write!(f, "metadata JSON error: {e}"),
            MetadataPersistError::UnsupportedSchema { found } => write!(
                f,
                "unsupported metadata schema version {found} (supported: {:?})",
                SUPPORTED_METADATA_SCHEMAS
            ),
        }
    }
}

impl std::error::Error for MetadataPersistError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            MetadataPersistError::Json(e) => Some(e),
            MetadataPersistError::UnsupportedSchema { .. } => None,
        }
    }
}

impl From<serde_json::Error> for MetadataPersistError {
    fn from(e: serde_json::Error) -> Self {
        MetadataPersistError::Json(e)
    }
}

impl RunMetadata {
    pub fn new(name: String, timeout_ms: u64) -> Self {
        Self {
            schema: RUN_METADATA_SCHEMA_VERSION,
            timeout_ms,
            name,
            run_id: None,
            engine_version: None,
            environment_fingerprint_hash: None,
            suite_history: Vec::new(),
        }
    }

    /// Sets the provenance identifiers carried by this run (#1864).
    pub fn with_provenance_refs(
        mut self,
        run_id: impl Into<String>,
        engine_version: impl Into<String>,
        environment_fingerprint_hash: impl Into<String>,
    ) -> Self {
        self.run_id = Some(run_id.into());
        self.engine_version = Some(engine_version.into());
        self.environment_fingerprint_hash = Some(environment_fingerprint_hash.into());
        self
    }

    pub fn load_json(bytes: &[u8]) -> Result<Self, MetadataPersistError> {
        let doc: serde_json::Value = serde_json::from_slice(bytes)?;
        let schema = doc
            .get("schema")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(0);

        if !SUPPORTED_METADATA_SCHEMAS.contains(&schema) {
            return Err(MetadataPersistError::UnsupportedSchema { found: schema });
        }

        let mut mutable = doc;
        // Normalize history entries to canonical order (W5-B01) so that
        // parallel runs produce identical bytes regardless of completion order.
        if let Some(history) = mutable.get_mut("suite_history").and_then(|v| v.as_array_mut()) {
            for entry in history.iter_mut() {
                if let Some(groups) = entry.get_mut("groups").and_then(|v| v.as_array_mut()) {
                    for g in groups.iter_mut() {
                        if let Some(failed) = g.get_mut("failed_fixtures").and_then(|v| v.as_array_mut()) {
                            failed.sort_by(compare_json_strings);
                        }
                    }
                    groups.sort_by(|a, b| {
                        json_str(a, "group").cmp(json_str(b, "group"))
                    });
                }
                if let Some(delta) = entry.get_mut("classification_delta") {
                    if let Some(obj) = delta.as_object_mut() {
                        for k in ["fixed", "regressed", "newly_failing"] {
                            if let Some(arr) = obj.get_mut(k).and_then(|v| v.as_array_mut()) {
                                arr.sort_by(compare_json_strings);
                            }
                        }
                    }
                }
            }
            history.sort_by(|a, b| {
                let a_id = json_str(a, "run_id");
                let b_id = json_str(b, "run_id");
                a_id.cmp(b_id)
            });
        }

        let metadata: RunMetadata = serde_json::from_value(mutable)?;
        Ok(metadata)
    }

    pub fn save_json(&self) -> Result<Vec<u8>, MetadataPersistError> {
        Ok(serde_json::to_vec_pretty(self)?)
    }

    /// Append a suite run record, keeping the history in canonical order.
    pub fn record_suite_run(&mut self, mut record: SuiteRunRecord) {
        record.normalize();
        self.suite_history.push(record);
        self.suite_history.sort_by(|a, b| a.run_id.cmp(&b.run_id));
    }

    /// Return history entries for a suite, in canonical (run_id) order.
    pub fn history_for(&self, suite: &str) -> Vec<&SuiteRunRecord> {
        self.suite_history
            .iter()
            .filter(|r| suite.is_empty() || r.suite == suite)
            .collect()
    }
}

impl SuiteRunRecord {
    /// Sort internal collections so the record is byte-stable for any
    /// completion order.
    pub fn normalize(&mut self) {
        for g in self.groups.iter_mut() {
            g.failed_fixtures.sort();
            g.failed_fixtures.dedup();
        }
        self.groups.sort_by(|a, b| a.group.cmp(&b.group));
        self.classification_delta.normalize();
    }
}

impl ClassificationDelta {
    pub fn normalize(&mut self) {
        for v in [
            &mut self.fixed,
            &mut self.regressed,
            &mut self.newly_failing,
        ] {
            v.sort();
            v.dedup();
        }
    }
}

fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn compare_json_strings(a: &serde_json::Value, b: &serde_json::Value) -> std::cmp::Ordering {
    let as_str = a.as_str().unwrap_or_default();
    let bs_str = b.as_str().unwrap_or_default();
    as_str.cmp(bs_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_record(run_id: &str, failed: &[str]) -> SuiteRunRecord {
        SuiteRunRecord {
            run_id: run_id.to_string(),
            suite: "core".to_string(),
            started_at_ms: 1700000000000,
            duration_ms: 1234,
            groups: vec![
                GroupResult {
                    group: "area:consensus".to_string(),
                    passed: 3,
                    failed: failed.len() as u32,
                    failed_fixtures: failed.iter().map(|s| s.to_string()).collect(),
                },
                GroupResult {
                    group: "area:storage".to_string(),
                    passed: 2,
                    failed: 0,
                    failed_fixtures: Vec::new(),
                },
            ],
            classification_delta: ClassificationDelta {
                fixed: vec![],
                regressed: failed.iter().map(|s| s.to_string()).collect(),
                newly_failing: Vec::new(),
            },
            git_ref: Some("deadbeef".to_string()),
        }
    }

    #[test]
    fn load_valid_metadata() {
        let meta = RunMetadata::new("test-run".to_string(), 5000);
        let bytes = meta.save_json().unwrap();
        let loaded = RunMetadata::load_json(&bytes).unwrap();
        assert_eq!(loaded.schema, RUN_METADATA_SCHEMA_VERSION);
        assert_eq!(loaded.timeout_ms, 5000);
        assert!(loaded.suite_history.is_empty());
    }

    #[test]
    fn rejects_unsupported_schema() {
        let json = r#"{"schema": 999, "timeout_ms": 1000, "name": "bad"}"#;
        let err = RunMetadata::load_json(json.as_bytes()).unwrap_err();
        match err {
            MetadataPersistError::UnsupportedSchema { found } => assert_eq!(found, 999),
            _ => panic!("Expected unsupported schema error"),
        }
    }

    #[test]
    fn legacy_metadata_without_provenance_refs_loads() {
        let json = r#"{"schema": 1, "timeout_ms": 1000, "name": "legacy"}"#;
        let meta = RunMetadata::load_json(json.as_bytes()).unwrap();
        assert!(meta.run_id.is_none());
        assert!(meta.engine_version.is_none());
        assert!(meta.environment_fingerprint_hash.is_none());
    }

    #[test]
    fn provenance_refs_round_trip() {
        let meta = RunMetadata::new("run".to_string(), 1000).with_provenance_refs(
            "run-42",
            "0.1.0",
            "deadbeef",
        );
        let bytes = meta.save_json().unwrap();
        let loaded = RunMetadata::load_json(&bytes).unwrap();
        assert_eq!(loaded.run_id.as_deref(), Some("run-42"));
        assert_eq!(loaded.engine_version.as_deref(), Some("0.1.0"));
        assert_eq!(loaded.environment_fingerprint_hash.as_deref(), Some("deadbeef"));
    }

    #[test]
    fn history_round_trip_preserves_records() {
        let mut meta = RunMetadata::new("ci".to_string(), 1000);
        meta.record_suite_run(sample_record("run-2", &["tf:b2"]));
        meta.record_suite_run(sample_record("run-1", &["tf:a1", "tf:a1"]));

        let bytes = meta.save_json().unwrap();
        let loaded = RunMetadata::load_json(&bytes).unwrap();

        assert_eq!(loaded.suite_history.len(), 2);
        // Canonical order by run_id.
        assert_eq!(loaded.suite_history[0].run_id, "run-1");
        assert_eq!(loaded.suite_history[1].run_id, "run-2");
        // Duplicate failed fixtures are deduplicated and sorted.
        assert_eq!(
            loaded.suite_history[0].groups[0].failed_fixtures,
            vec!["tf:a1".to_string()]
        );
        assert_eq!(
            loaded.suite_history[0].classification_delta.regressed,
            vec!["tf:a1".to_string()]
        );
    }

    #[test]
    fn history_independent_of_insertion_order() {
        let mut a = RunMetadata::new("ci".to_string(), 1000);
        a.record_suite_run(sample_record("run-1", &["tf:a1"]));
        a.record_suite_run(sample_record("run-2", &["tf:b2"]));

        let mut b = RunMetadata::new("ci".to_string(), 1000);
        b.record_suite_run(sample_record("run-2", &["tf:b2"]));
        b.record_suite_run(sample_record("run-1", &["tf:a1"]));

        assert_eq!(a.save_json().unwrap(), b.save_json().unwrap());
    }

    #[test]
    fn history_for_filters_by_suite() {
        let mut meta = RunMetadata::new("ci".to_string(), 1000);
        meta.record_suite_run(sample_record("run-1", &[]));
        let mut other = sample_record("run-2", &[]);
        other.suite = "other".to_string();
        meta.record_suite_run(other);

        assert_eq!(meta.history_for("core").len(), 1);
        assert_eq!(meta.history_for("other").len(), 1);
        assert_eq!(meta.history_for("").len(), 2);
    }
}