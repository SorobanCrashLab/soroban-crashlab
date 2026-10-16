//! Load JSON regression suites produced by [`crate::scenario_export::export_suite_json`]
//! and evaluate each [`FailureScenario`] by re-classifying the seed payload.

use crate::scenario_export::FailureScenario;
use crate::{classify, CaseSeed};
use serde::Serialize;

/// Schema version of the JSON report written by `crashlab regression-suite --report`.
pub const REGRESSION_REPORT_SCHEMA_VERSION: u32 = 1;

/// Outcome for one scenario row after replay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RegressionSuiteSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub cases: Vec<RegressionCaseResult>,
}

impl RegressionSuiteSummary {
    pub fn all_passed(&self) -> bool {
        self.failed == 0 && self.total > 0
    }

    /// Machine-readable report consumed by CI (classification deltas, PR
    /// summaries, dashboard ingest). Same fields as the summary plus `schema`.
    pub fn to_report_json(&self) -> Result<String, serde_json::Error> {
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
                error: Some(format!("invalid input_payload hex: {e}")),
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
    use crate::scenario_export::export_suite_json;
    use crate::{to_bundle, CaseSeed};

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
        assert!(!summary.cases[0].passed);
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
        assert!(!summary.all_passed());
    }
}
