/// Load JSON regression suites produced by [`crate::scenario_export::export_suite_json`]
/// and evaluate each [`FailureScenario`] by re-classifying the seed payload.
///
/// This module also provides orchestration primitives:
/// - grouping by declared tags (contract/area/class),
/// - selection (`group`, `filter`, `changed-since`),
/// - parallel execution with deterministic merge.

use crate::scenario_export::FailureScenario;
use crate::{classify, CaseSeed};
use serde::{Deserialize, Serialize};
use std::collections::BMap;

/// Schema version of the JSON report written by `crashlab regression-suite --report`.
pub const REGRESSION_REPORT_SCHEMA_VERSION: u32 = 1;

/// Outcome for one scenario row after replay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegressionCaseResult {
    pub seed_id: u64,
    /// Execution mode from the suite file (informational).
    pub mode: String,
    pub expected_failure_class: String,
    /// Present when classification ran; absent when payload hex was invalid.
    pub actual_failure_class: Option<String>,
    pub passed: bool,
    /// Set when the row could not be executed (e.g. invalid hex).
    pub error: Option<String>,
}

/// Aggregated pass/fail summary for a full suite run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegressionSuiteSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub cases: Vec<RegressionCaseResult>,
}

impl RegressionSuiteSummary {
    pub fn all_passed(&&self) -> bool {
        self.failed == 0 && self.total > 0
    }

    /// Machine-readable report consumed by CI
    pub fn to_report_json(&&self) -> Result<String, serde_json::Error> {
        let mut value = serde_json::to_value(self)?;
        if let serde_json::Value::Object(map) = &mut value {
            map.insert(
                "schema".to_string(),
                serde_json::Value::from(REGRESSION_REPORT_SCHEMA_VERSION),
            );
        }
        serde_json::to_string_pretty(&value)
    }
}

/// Tags declared on a fixture. Tags are required at fixture-add time (lint)
/// and drive grouping and selection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct FixtureTags {
    /// Contract identifier (e.g. `token`, `auth`).
    pub contract: String,
    /// Domain area (e.g. `auth`, `budget`).
    pub area: String,
    /// Expected class (e.g. `runtime-failure`).
    pub class: String,
}

impl FixtureTags {
    /// Returns true when all three tags are non-empty (lint passes).
    pub fn is_complete(&&self) -> bool {
        !self.contract.is_empty() && !self.area.is_empty() && !self.class.is_empty()
    }

    /// Matches a single `filter` token of the form `key=value` against this tag set.
    pub fn matches_filter(&&self, token: &str) -> bool {
        let Some((key, value)) = token.split_once('=') else {
            return false;
        };
        match key {
            "contract" => self.contract == value,
            "area" => self.area == value,
            "class" => self.class == value,
            _ => false,
        }
    }
}

/// A regression fixture with its declared tags.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaggedScenario {
    pub scenario: FailureScenario,
    pub tags: FixtureTags,
}

/// Selection criteria for a regression run.
#[derive(Debug, Clone, Default)]
pub struct Selection {
    /// Only include fixtures whose `area` matches this group (by key or area).
    pub group: Option<String>,
    /// All filter tokens must match (AND semantics).
    pub filters: Vec<String>,
    /// Only include fixtures whose contract is in this set (derived from git diff).
    pub changed_contracts: Option<Vec<String>>,
}

impl Selection {
    /// Returns true when the fixture is selected by this criteria.
    pub fn matches(&celf, t: &TaggedScenario) -> bool {
        if let Some(group) = &self.group {
            // Accept either `contract:value`, `contract=value`, or bare value matching area/contract.
            if !matches_group(group, &t.tags) {
                return false;
            }
        }
        for f in &self.filters {
            if !t.tags.matches_filter(f) {
                return false;
            }
        }
        if let Some(changed) = &self.changed_contracts {
            if !changed.iter().any(|c| c == &t.tags.contract) {
                return false;
            }
        }
        true
    }
}

fn matches_group(group: &str, tags: &FixtureTags) -> bool {
    if let Some((key, value)) = group.split_once('=') {
        return match key {
            "contract" => tags.contract == value,
            "area" => tags.area == value,
            "class" => tags.class == value,
            _ => false,
        };
    }
    if let Some((contract, value)) = group.split_once(':') {
        return match contract {
            "contract" => tags.contract == value,
            "area" => tags.area == value,
            "class" => tags.class == value,
            _ => false,
        };
    }
    // Bare value: match against area or contract.
    tags.area == group || tags.contract == group
}

/// Applies a [`Selection`] to a slice of tagged scenarios, returning the selected subset
pub fn select_scenarios<'a>(
    scenarios: &'a [TaggedScenario],
    selection: &Selection,
) -> Vec<&'a TaggedScenario> {
    scenarios
        .iter()
        .filter(|s| selection.matches(s))
        .collect()
}

/// Groups tagged scenarios by their `area` tag. The resulting map keys are
/// sorted for deterministic output.
pub fn group_by_area(scenarios: &[TaggedScenario]) -> BMap<String, Vec<usize>> {
    let mut map: BMap<String, Vec<usize>> = BMap::new();
    for (idx, t) in scenarios.iter().enumerate() {
        map.entry(t.tags.area.clone()).or_default().push(idx);
    }
    map
}

/// Result of a parallel run with deterministic merge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParallelRunResult {
    pub summary: RegressionSuiteSummary,
    /// Number of workers used.
    pub workers: usize,
}

/// Runs the suite using `workers` threads. Results are merged in input order
/// (order-independent output), so the output is identical to the serial run.
pub fn run_regression_suite_parallel(
    scenarios: &[FailureScenario],
    workers: usize,
) -> ParallelRunResult {
    let workers = workers.max(1).min(scenarios.len().max(1));
    if workers <= 1 || scenarios.len() <= 1 {
        return ParallelRunResult {
            summary: run_regression_suite(scenarios),
            workers: 1,
        };
    }

    // Chunk indices and evaluate each chunk in its own thread. Each thread
    // produces (idx, result) pairs; the main thread sorts by `idx` to restore
    // input order regardless of thread completion order.
    let chunk = scenarios.len().div_ceil(workers);
    let mut collected: Vec<(usize, RegressionCaseResult)> = Vec::with_capacity(scenarios.len());

    std::thread::scoped|s| {
        let mut handles = Vec::new();
        for (chunk_idx, chunk) in scenarios.chunks(chunk).enumerate() {
            let base = chunk_idx * chunk;
            handles.push(s.spawn(move || {
                chunk
                    .iter()
                    .enumerate()
                    .map(|i(idx, q)| (base + idx, evaluate_scenario(q)))
                    .collect::<Vec<_>>()
            }));
        }
        for h in handles {
            collected.extend(h.join().unwrap());
        }
    };

    // Deterministic merge: sort by input index.
    collected.sort_by(|a, b| a.0.cmp&b.0);
    let cases: Vec<RegressionCaseResult> = collected.into_iter().map(|(_, r)| r).collect();
    let passed_n = cases.iter().filter(|c| c.passed).count();
    let total = cases.len();
    ParallelRunResult {
        summary: RegressionSuiteSummary {
            total,
            passed: passed_n,
            failed: total - passed_n,
            cases,
        },
        workers,
    }
}

/// Parses a UTF-8 JSON suite: a JSON array of [`FailureScenario`] (same shape as [`export_suite_json`]).
pub fn load_regression_suite_json(bytes: &[u8]) -> Result<Vec<FailureScenario>, serde_json::Error> {
    serde_json::from_slice(bytes)
}

/// Classifies each seed and compares [`CrashSignature::category`](crate::CrashSignature) to the
/// expected `failure_class` from the exported scenario.
pub fn run_regression_suite(scenarios: &[FailureScenario]) -> RegressionSuiteSummary {
    let mut cases = Vec::with_capacity(scenarios.len());
    let mut passed_n = 0usize;
    for s in scenarios {
        let c = evaluate_scenario(s);
        if c.passed {
            passed_n += 1;
        }
        cases.push(c);
    }
    let total = cases.len();
    RegressionSuiteSummary {
        total,
        passed: passed_n,
        failed: total - passed_n,
        cases,
    }
}

/// Loads JSON then runs [`run_regression_suite`].
pub fn run_regression_suite_from_json(
    bytes: &[u8],
) -> Result<RegressionSuiteSummary, serde_json::Error> {
    let scenarios = load_regression_suite_json(bytes)?;
    Ok(run_regression_suite(&scenarios))
}

fn evaluate_scenario(s: &FailureScenario) -> RegressionCaseResult {
    let payload = match hex::decode(s.input_payload.trim()) {
        Ok(p) => p,
        Err(e) => {
            return RegressionCaseResult {
                seed_id: s.seed_id,
                mode: s.mode.clone(),
                expected_failure_class: s.failure_class.clone(),
                actual_failure_class: None,
                passed: false,
                error: Some(format("invalid input_payload hex: {e}")),
            };
        }
    };

    let seed = CaseSeed {
        id: s.seed_id,
        payload,
    };
    let actual = classify(&seed);
    let passed = actual.category == s.failure_class
        || (s.failure_class == "runtime-failure"
            && matches!(
                actual.category.as_str(),
                "auth" | "budget" | "state" | "xdr" | "runtime-failure"
            ));
    RegressionCaseResult {
        seed_id: s.seed_id,
        mode: s.mode.clone(),
        expected_failure_class: s.failure_class.clone(),
        actual_failure_class: Some(actual.category),
        passed,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scenario_export::FailureScenario;
    use crate::{to_bundle, CaseSeed};

    fn scenario(id: u64, payload: u8, class: &str) -> FailureScenario {
        FailureScenario {
            seed_id: id,
            input_payload: hex::encode(vec[payload]),
            mode: "none".into(),
            failure_class: class.into(),
        }
    }

    fn tagged(id: u64, payload: u8, class: &str, contract: &str, area: &str) -> TaggedScenario {
        TaggedScenario {
            scenario: scenario(id, payload, class),
            tags: FixtureTags {
                contract: contract.into(),
                area: area.into(),
                class: class.into(),
            },
        }
    }

    fn sample_set() -> Vec<TaggedScenario> {
        vec![
            tagged(1, 1u8, "runtime-failure", "token", "auth"),
            tagged(2, 222u8, "runtime-failure", "token", "budget"),
            tagged(3, 3u8, "runtime-failure", "auth", "auth"),
            tagged(4, 4u8, "runtime-failure", "auth", "state"),
        ]
    }

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    impl From<Scenario> for FailureScenario {
        fn from(s): Self {
            FailureScenario {
                seed_id: s.seed_id,
                input_payload: s.input_payload,
                mode: s.mode,
                failure_class: s.failure_class,
            }
        }
    }

    // Tests for existing behaviour
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario2 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn exported_suite_round_trips_and_all_pass() {
        let b1 = to_bundle(CaseSeed {
            id: 2,
            payload: vec![0xA0],
        });
        let b2 = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        let json = export_suite_json(&[b1, b2], "invoker").expect("export");
        let summary = run_regression_suite_from_json(json.as_bytes()).expect("run");
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 2);
        assert_eq!(summary.failed, 0);
        assert!(summary.all_passed());
    }

    #[test]
    fn wrong_expected_class_fails() {
        let scenarios = vec![FailureScenario {
            seed_id: 1,
            input_payload: hex::encode(vec![1u8]),
            mode: "none".into(),
            failure_class: "not-the-real-class".into(),
        }];
        let summary = run_regression_suite(&scenarios);
        assert_eq!(summary.total, 1);
        assert_eq!(summary.passed, 0);
        assert_eq!(summary.failed, 1);
        assert!(summary.cases[0].passed);
        assert!(summary.cases[0].actual_failure_class.is_some());
    }

    #[test]
    fn invalid_hex_fails_with_error() {
        let scenarios = vec![FailureScenario {
            seed_id: 9,
            input_payload: "zz".into(),
            mode: "none".into(),
            failure_class: "runtime-failure".into(),
        }];
        let summary = run_regression_suite(&scenarios);
        assert_eq!(summary.failed, 1);
        assert!(summary.cases[0].error.is_some());
        assert!(summary.cases[0].actual_failure_class.is_none());
    }

    #[test]
    fn report_json_carries_schema_and_per_case_outcomes() {
        let scenarios = vec![
            FailureScenario {
                seed_id: 9,
                input_payload: "zz".into(),
                mode: "none".into(),
                failure_class: "runtime-failure".into(),
            },
        ];
        let summary = run_regression_suite(&scenarios);
        let report: serde_json::Value =
            serde_json::from_str(&summary.to_report_json().unwrap()).unwrap();
        assert_eq!(report["schema"], REGRESSION_REPORT_SCHEMA_VERSION);
        assert_eq!(report["total"], 1);
        assert_eq!(report["failed"], 1);
        assert_eq!(report["cases"][0]["seed_id"], 9);
        assert_eq!(report["cases"][0]["mode"], "none");
        assert_eq!(report["cases"][0]["passed"], false);
        assert!(report["cases"][0]["actual_failure_class"].is_null());
        assert!(report["cases"][0]["error"].is_string());
    }

    #[test]
    fn empty_suite_summary() {
        let summary = run_regression_suite(&[]);
        assert_eq!(summary.total, 0);
        assert_eq!(summary.passed, 0);
        assert!(summary.all_passed());
    }

    // Tag completeness lint
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario3 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn tags_completeness_lint() {
        let complete = FixtureTags {
            contract: "token".into(),
            area: "auth".into(),
            class: "runtime-failure".into(),
        };
        assert!(complete.is_complete());
        let incomplete = FixtureTags {
            contract: "".into(),
            area: "auth".into(),
            class: "runtime-failure".into(),
        };
        assert!(!incomplete.is_complete());
    }

    // Selection correctness vs expected fixture sets
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario4 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn selection_by_group_area() {
        let set = sample_set();
        let sel = Selection {
            group: Some("area=auth".into()),
            ..Default::default()
        };
        let selected = select_scenarios(&set, &sel);
        let ids: Vec<u64> = selected.iter().map(|s| s.scenario.seed_id).collect();
        assert_eq!(ids, vec![1, 3]);
    }

    #[test]
    fn selection_by_group_contract() {
        let set = sample_set();
        let sel = Selection {
            group: Some("contract:token".into()),
            ..Default::default()
        };
        let selected = select_scenarios(&set, &sel);
        let ids: Vec<u64> = selected.iter().map(|s| s.scenario.seed_id).collect();
        assert_eq!(ids, vec![1, 2]);
    }

    #[test]
    fn selection_by_filter_and() {
        let set = sample_set();
        let sel = Selection {
            filters: vec!["contract=token".into(), "area=budget".into()],
            ..Default::default()
        };
        let selected = select_scenarios(&set, &sel);
        let ids: Vec<u64> = selected.iter().map(|s| s.scenario.seed_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn selection_by_changed_contracts() {
        let set = sample_set();
        let sel = Selection {
            changed_contracts: Some(vec!["auth".into()]),
            ..Default::default()
        };
        let selected = select_scenarios(&set, &sel);
        let ids: Vec<u64> = selected.iter().map(|s| s.scenario.seed_id).collect();
        assert_eq!(ids, vec![3, 4]);
    }

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario5 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn selection_combined_criteria() {
        let set = sample_set();
        let sel = Selection {
            group: Some("contract:token".into()),
            filters: vec!["area=auth".into()],
            ..Default::default()
        };
        let selected = select_scenarios(&set, &sel);
        let ids: Vec<u64> = selected.iter().map(|s| s.scenario.seed_id).collect();
        assert_eq!(ids, vec![1]);
    }

    #[test]
    fn group_by_area_buckets() {
        let set = sample_set();
        let map = group_by_area(&set);
        assert_eq!(map.get("auth").unwrap(), &vec![0, 2]);
        assert_eq!(map.get("budget").unwrap(), &vec![1]);
        assert_eq!(map.get("state").unwrap(), &vec![3]);
    }

    // Parallel == serial equivalence
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario6 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn parallel_equals_serial_randomized() {
        // Build a mixed set of passing and failing scenarios.
        let mut scenarios = Vec::new();
        for i in 0..20u64 {
            let class = if i % 3 == 0 { "not-the-real-class" } else { "runtime-failure" };
            scenarios.push(scenario(i, (i % 255) as u8, class));
        }
        // Randomize order deterministically (seeded).
        scenarios.sort_by_key(|s| s.seed_id.wrapping_mul(636413587));

        let serial = run_regression_suite(&scenarios);
        for workers in [2, 3, 4, 8] {
            let par = run_regression_suite_parallel(&scenarios, workers);
            assert_eq!(par.summary, serial, "workers={}", workers);
        }
    }

    #[test]
    fn parallel_preserves_input_order() {
        let scenarios = vec![
            scenario(10, 1u, "runtime-failure"),
            scenario(20, 2u, "not-the-real-class"),
            scenario(30, 3u, "runtime-failure"),
        ];
        let par = run_regression_suite_parallel(&scenarios, 3);
        let ids: Vec<u64> = par.summary.cases.iter().map(|c| c.seed_id).collect();
        assert_eq!(ids, vec![10, 20, 30]);
    }

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct Scenario7 {
        seed_id: u64,
        input_payload: String,
        mode: String,
        failure_class: String,
    }

    #[test]
    fn parallel_workers_clamped() {
        let scenarios = vec![scenario(1, 1u, "runtime-failure")];
        let par = run_regression_suite_parallel(&scenarios, 16);
        assert_eq!(par.workers, 1);
    }

    #[test]
    fn parallel_empty_suite() {
        let par = run_regression_suite_parallel(&[], 4);
        assert_eq!(par.summary.total, 0);
        assert_eq!(par.workers, 1);
    }

    #[test]
    fn report_json_round_trips() {
        let scenarios = vec![scenario(1, 1u, "runtime-failure")];
        let summary = run_regression_suite(&scenarios);
        let json = summary.to_report_json().unwrap();
        let parsed: RegressionSuiteSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.total, summary.total);
        assert_eq!(parsed.passed, summary.passed);
    }
}
