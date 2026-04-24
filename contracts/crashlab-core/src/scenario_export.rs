use crate::CaseBundle;
use serde::{Deserialize, Serialize};

/// Normalized JSON scenario for cross-tool reuse.
///
/// Contains all information needed to reproduce a failing test case,
/// including the seed ID, input payload, execution mode, and expected failure class.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FailureScenario {
    /// Unique identifier for the seed that produced this failure.
    pub seed_id: u64,

    /// Input payload as a hex-encoded string for JSON compatibility.
    pub input_payload: String,

    /// Execution mode or context (e.g., "invoker", "contract", "none").
    pub mode: String,

    /// Expected failure classification (e.g., "runtime-failure", "empty-input").
    pub failure_class: String,
}

impl FailureScenario {
    /// Creates a new scenario from a bundle with the specified mode.
    ///
    /// # Arguments
    ///
    /// * `bundle` - The case bundle containing seed and signature information
    /// * `mode` - The execution mode or context string
    pub fn from_bundle(bundle: &CaseBundle, mode: impl Into<String>) -> Self {
        Self {
            seed_id: bundle.seed.id,
            input_payload: hex::encode(&bundle.seed.payload),
            mode: mode.into(),
            failure_class: bundle.signature.category.clone(),
        }
    }
}

/// Exports a failure scenario as a JSON string.
///
/// # Arguments
///
/// * `bundle` - The case bundle to export
/// * `mode` - The execution mode or context
///
/// # Returns
///
/// A JSON string representation of the failure scenario, or an error if serialization fails.
///
/// This exports the raw bundle payload. For public sharing, prefer
/// [`crate::export_sanitized_scenario_json`] so secret-like fragments are
/// scrubbed before the payload is hex-encoded into JSON.
///
/// # Example
///
/// ```rust
/// use crashlab_core::{to_bundle, CaseSeed};
/// use crashlab_core::scenario_export::export_scenario_json;
///
/// let bundle = to_bundle(CaseSeed { id: 42, payload: vec![1, 2, 3] });
/// let json = export_scenario_json(&bundle, "invoker").unwrap();
/// assert!(json.contains("\"seed_id\": 42"));
/// ```
pub fn export_scenario_json(
    bundle: &CaseBundle,
    mode: impl Into<String>,
) -> Result<String, serde_json::Error> {
    let scenario = FailureScenario::from_bundle(bundle, mode);
    serde_json::to_string_pretty(&scenario)
}

/// Exports a failing seed as a normalized JSON scenario for cross-tool reuse.
///
/// This is a focused variant of [`export_scenario_json`] that explicitly
/// documents the "failing seed" contract: the exported JSON always includes
/// the `seed_id`, hex-encoded `input_payload`, `mode`, and `failure_class`.
/// The output is stable and deterministic for the same input, making it
/// suitable for regression archives, replay harnesses, and external tools.
///
/// For sanitized public sharing (scrubbing secret-like fragments) use
/// [`crate::export_sanitized_scenario_json`] instead.
///
/// # Errors
///
/// Returns a [`serde_json::Error`] if JSON serialization fails (in practice
/// this does not happen for well-formed strings, but callers should handle it).
///
/// # Example
///
/// ```rust
/// use crashlab_core::{to_bundle, CaseSeed};
/// use crashlab_core::scenario_export::export_failing_seed_json;
///
/// let bundle = to_bundle(CaseSeed { id: 7, payload: vec![0x01, 0x02, 0x03] });
/// let json = export_failing_seed_json(&bundle, "invoker").unwrap();
///
/// // The output round-trips through serde_json.
/// let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
/// assert_eq!(parsed["seed_id"], 7);
/// assert_eq!(parsed["mode"], "invoker");
/// assert!(!parsed["input_payload"].as_str().unwrap().is_empty());
/// assert!(!parsed["failure_class"].as_str().unwrap().is_empty());
/// ```
pub fn export_failing_seed_json(
    bundle: &CaseBundle,
    mode: impl Into<String>,
) -> Result<String, serde_json::Error> {
    export_scenario_json(bundle, mode)
}

/// Exports a collection of bundles as a deterministically ordered JSON suite.
///
/// Scenarios are sorted by `(seed_id, failure_class)` before serialization so
/// that consecutive exports of the same bundle set always produce byte-identical
/// output regardless of the order in which bundles were collected.
///
/// Reload and execute with [`crate::regression_suite::run_regression_suite_from_json`].
///
/// # Example
///
/// ```rust
/// use crashlab_core::{to_bundle, CaseSeed};
/// use crashlab_core::scenario_export::export_suite_json;
///
/// let b1 = to_bundle(CaseSeed { id: 2, payload: vec![0xA0] });
/// let b2 = to_bundle(CaseSeed { id: 1, payload: vec![1, 2, 3] });
/// let json_forward = export_suite_json(&[b1.clone(), b2.clone()], "invoker").unwrap();
/// let json_reverse = export_suite_json(&[b2, b1], "invoker").unwrap();
/// assert_eq!(json_forward, json_reverse);
/// ```
pub fn export_suite_json(
    bundles: &[CaseBundle],
    mode: impl Into<String> + Clone,
) -> Result<String, serde_json::Error> {
    let mut scenarios: Vec<FailureScenario> = bundles
        .iter()
        .map(|b| FailureScenario::from_bundle(b, mode.clone()))
        .collect();
    scenarios.sort_by(|a, b| {
        a.seed_id
            .cmp(&b.seed_id)
            .then_with(|| a.failure_class.cmp(&b.failure_class))
    });
    serde_json::to_string_pretty(&scenarios)
}

/// Exports a crash report in Markdown for issue attachments.
///
/// Includes signature context and a replay command section.
pub fn export_crash_report_markdown(
    bundle: &CaseBundle,
    mode: impl Into<String>,
    replay_command: impl Into<String>,
) -> String {
    let mode = mode.into();
    let replay_command = replay_command.into();
    let payload_hex = hex::encode(&bundle.seed.payload);

    format!(
        "# Crash Report\n\n## Signature Context\n- Category: `{}`\n- Digest: `{}`\n- Signature Hash: `{}`\n- Mode: `{}`\n\n## Seed\n- Seed ID: `{}`\n- Payload (hex): `{}`\n\n## Replay Command\n```bash\n{}\n```\n",
        bundle.signature.category,
        bundle.signature.digest,
        bundle.signature.signature_hash,
        mode,
        bundle.seed.id,
        payload_hex,
        replay_command
    )
}

fn is_valid_rust_ident(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

/// Builds a single `#[test] fn … { … }` regression block for `bundle`.
///
/// Shared with [`crate::regression_grouping::export_rust_regression_suite`] so suite export
/// stays byte-for-byte consistent with standalone fixture export.
pub(crate) fn format_rust_regression_test_fn(
    bundle: &CaseBundle,
    test_name: &str,
) -> Result<String, String> {
    if !is_valid_rust_ident(test_name) {
        return Err(
            "invalid test name: must be a non-empty Rust identifier (a-z, A-Z, 0-9, _)".into(),
        );
    }

    let payload_literal = if bundle.seed.payload.is_empty() {
        String::new()
    } else {
        bundle
            .seed
            .payload
            .iter()
            .map(|b| format!("0x{b:02x}"))
            .collect::<Vec<_>>()
            .join(", ")
    };

    Ok(format!(
        r#"#[test]
fn {test_name}() {{
    use crashlab_core::{{replay_seed_bundle, CaseBundle, CaseSeed, CrashSignature}};

    let bundle = CaseBundle {{
        seed: CaseSeed {{
            id: {seed_id},
            payload: vec![{payload_literal}],
        }},
        signature: CrashSignature {{
            category: {category:?}.to_string(),
            digest: {digest},
            signature_hash: {signature_hash},
        }},
        environment: None,
        failure_payload: vec![],
    }};

    let result = replay_seed_bundle(&bundle);
    assert_eq!(result.actual.category, {category:?});
    assert_eq!(result.actual.digest, {digest});
    assert_eq!(result.actual.signature_hash, {signature_hash});
    assert!(result.matches, "replay should match exported failing bundle signature");
}}
"#,
        test_name = test_name,
        seed_id = bundle.seed.id,
        payload_literal = payload_literal,
        category = bundle.signature.category,
        digest = bundle.signature.digest,
        signature_hash = bundle.signature.signature_hash
    ))
}

/// Exports a failing bundle as a Rust regression test fixture snippet.
///
/// The emitted snippet is deterministic and intended for inclusion in an
/// integration test harness that depends on `crashlab-core`.
pub fn export_rust_regression_fixture(
    bundle: &CaseBundle,
    test_name: &str,
) -> Result<String, String> {
    format_rust_regression_test_fn(bundle, test_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{to_bundle, CaseSeed};

    #[test]
    fn scenario_contains_all_required_fields() {
        let bundle = to_bundle(CaseSeed {
            id: 123,
            payload: vec![0xAA, 0xBB, 0xCC],
        });

        let scenario = FailureScenario::from_bundle(&bundle, "invoker");

        assert_eq!(scenario.seed_id, 123);
        assert!(!scenario.input_payload.is_empty());
        assert_eq!(scenario.mode, "invoker");
        assert!(!scenario.failure_class.is_empty());
    }

    #[test]
    fn payload_is_hex_encoded() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0x01, 0x02, 0x03],
        });

        let scenario = FailureScenario::from_bundle(&bundle, "contract");

        // After mutation, payload will be different, but should still be valid hex
        assert!(scenario
            .input_payload
            .chars()
            .all(|c| c.is_ascii_hexdigit()));
        assert_eq!(scenario.input_payload.len() % 2, 0); // Even length for hex
    }

    #[test]
    fn export_json_produces_valid_json() {
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        });

        let json = export_scenario_json(&bundle, "none").unwrap();

        // Verify it's valid JSON by parsing it back
        let parsed: FailureScenario = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.seed_id, 42);
        assert_eq!(parsed.mode, "none");
    }

    #[test]
    fn json_contains_all_fields() {
        let bundle = to_bundle(CaseSeed {
            id: 999,
            payload: vec![0xFF],
        });

        let json = export_scenario_json(&bundle, "invoker").unwrap();

        assert!(json.contains("\"seed_id\""));
        assert!(json.contains("\"input_payload\""));
        assert!(json.contains("\"mode\""));
        assert!(json.contains("\"failure_class\""));
        assert!(json.contains("999"));
        assert!(json.contains("invoker"));
    }

    #[test]
    fn empty_payload_exports_successfully() {
        let bundle = to_bundle(CaseSeed {
            id: 7,
            payload: vec![],
        });

        let scenario = FailureScenario::from_bundle(&bundle, "contract");

        assert_eq!(scenario.seed_id, 7);
        assert_eq!(scenario.input_payload, ""); // Empty hex string
        assert_eq!(scenario.failure_class, "empty-input");
    }

    #[test]
    fn different_modes_are_preserved() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        let scenario_invoker = FailureScenario::from_bundle(&bundle, "invoker");
        let scenario_contract = FailureScenario::from_bundle(&bundle, "contract");
        let scenario_none = FailureScenario::from_bundle(&bundle, "none");

        assert_eq!(scenario_invoker.mode, "invoker");
        assert_eq!(scenario_contract.mode, "contract");
        assert_eq!(scenario_none.mode, "none");
    }

    #[test]
    fn suite_export_is_deterministic_regardless_of_input_order() {
        let b1 = to_bundle(CaseSeed {
            id: 2,
            payload: vec![0xA0],
        });
        let b2 = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });

        let json_forward = export_suite_json(&[b1.clone(), b2.clone()], "invoker").unwrap();
        let json_reverse = export_suite_json(&[b2, b1], "invoker").unwrap();

        assert_eq!(
            json_forward, json_reverse,
            "suite export must be byte-identical regardless of bundle input order"
        );
    }

    #[test]
    fn suite_export_orders_by_seed_id_ascending() {
        let b1 = to_bundle(CaseSeed {
            id: 10,
            payload: vec![1],
        });
        let b2 = to_bundle(CaseSeed {
            id: 5,
            payload: vec![1],
        });
        let b3 = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });

        let json = export_suite_json(&[b1, b2, b3], "none").unwrap();
        let parsed: Vec<FailureScenario> = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed[0].seed_id, 1);
        assert_eq!(parsed[1].seed_id, 5);
        assert_eq!(parsed[2].seed_id, 10);
    }

    #[test]
    fn suite_export_empty_slice_produces_empty_array() {
        let json = export_suite_json(&[], "invoker").unwrap();
        let parsed: Vec<FailureScenario> = serde_json::from_str(&json).unwrap();
        assert!(parsed.is_empty());
    }

    #[test]
    fn failure_class_matches_bundle_signature() {
        let bundle = to_bundle(CaseSeed {
            id: 50,
            payload: vec![1; 100], // Oversized
        });

        let scenario = FailureScenario::from_bundle(&bundle, "invoker");

        assert_eq!(scenario.failure_class, bundle.signature.category);
    }

    #[test]
    fn rust_fixture_export_contains_regression_test_shape() {
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![0x0A, 0x0B, 0x0C],
        });

        let fixture = export_rust_regression_fixture(&bundle, "seed_42_runtime").unwrap();

        assert!(fixture.contains("fn seed_42_runtime()"));
        assert!(fixture.contains("CaseSeed"));
        assert!(fixture.contains("replay_seed_bundle"));
        assert!(fixture.contains("assert_eq!(result.actual.category"));
        assert!(fixture.contains("runtime-failure"));
    }

    #[test]
    fn rust_fixture_export_rejects_invalid_test_name() {
        let bundle = to_bundle(CaseSeed {
            id: 8,
            payload: vec![1, 2, 3],
        });

        let err = export_rust_regression_fixture(&bundle, "seed 8 bad name").unwrap_err();
        assert!(err.contains("test name"));
    }

    #[test]
    fn markdown_export_contains_signature_context_and_replay_command() {
        let bundle = to_bundle(CaseSeed {
            id: 77,
            payload: vec![0xAA, 0xBB],
        });

        let md = export_crash_report_markdown(
            &bundle,
            "invoker",
            "cargo run --bin replay-single-seed ./bundle.json",
        );

        assert!(md.contains("Signature Context"));
        assert!(md.contains(&bundle.signature.category));
        assert!(md.contains(&bundle.signature.digest.to_string()));
        assert!(md.contains(&bundle.signature.signature_hash.to_string()));
        assert!(md.contains("cargo run --bin replay-single-seed"));
    }

    // ── export_failing_seed_json ───────────────────────────────────────────────

    #[test]
    fn export_failing_seed_json_produces_valid_json() {
        let bundle = to_bundle(CaseSeed {
            id: 42,
            payload: vec![0x10, 0x20, 0x30],
        });

        let json = export_failing_seed_json(&bundle, "invoker").unwrap();

        let parsed: FailureScenario = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.seed_id, 42);
        assert_eq!(parsed.mode, "invoker");
        assert!(!parsed.input_payload.is_empty());
        assert!(!parsed.failure_class.is_empty());
    }

    #[test]
    fn export_failing_seed_json_matches_export_scenario_json() {
        // The two functions must produce identical output for the same inputs
        // so consumers can rely on either API without divergence.
        let bundle = to_bundle(CaseSeed {
            id: 99,
            payload: vec![0xFF, 0x01],
        });

        let from_failing = export_failing_seed_json(&bundle, "contract").unwrap();
        let from_generic = export_scenario_json(&bundle, "contract").unwrap();

        assert_eq!(
            from_failing, from_generic,
            "export_failing_seed_json and export_scenario_json must produce identical output"
        );
    }

    #[test]
    fn export_failing_seed_json_contains_all_required_keys() {
        let bundle = to_bundle(CaseSeed {
            id: 5,
            payload: vec![0xAB],
        });

        let json = export_failing_seed_json(&bundle, "none").unwrap();

        assert!(json.contains("\"seed_id\""), "missing seed_id field");
        assert!(json.contains("\"input_payload\""), "missing input_payload field");
        assert!(json.contains("\"mode\""), "missing mode field");
        assert!(json.contains("\"failure_class\""), "missing failure_class field");
    }

    #[test]
    fn export_failing_seed_json_is_deterministic_for_same_seed() {
        let bundle = to_bundle(CaseSeed {
            id: 17,
            payload: vec![0x01, 0x02],
        });

        let json1 = export_failing_seed_json(&bundle, "invoker").unwrap();
        let json2 = export_failing_seed_json(&bundle, "invoker").unwrap();

        assert_eq!(
            json1, json2,
            "repeated exports of the same bundle must produce identical JSON"
        );
    }

    #[test]
    fn export_failing_seed_json_empty_payload_is_accepted() {
        let bundle = to_bundle(CaseSeed {
            id: 0,
            payload: vec![],
        });

        let json = export_failing_seed_json(&bundle, "none").unwrap();

        let parsed: FailureScenario = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.seed_id, 0);
        assert_eq!(parsed.input_payload, "");
        assert_eq!(parsed.failure_class, "empty-input");
    }
}
