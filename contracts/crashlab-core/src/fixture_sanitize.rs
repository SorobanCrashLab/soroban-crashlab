//! Sanitization helpers for share-safe fixture export.
//!
//! Public fixtures should keep enough structure to reproduce a failure class
//! without copying obvious credentials or session material into issue trackers.

use crate::bundle_persist::{BundlePersistError, CaseBundleDocument, CASE_BUNDLE_SCHEMA_VERSION};
use crate::scenario_export::FailureScenario;
use crate::{classify, CaseBundle, CaseSeed, CrashSignature};
use std::collections::HashMap;

// ── legacy key list (kept for backward-compatible low-level scanning) ────────

const SENSITIVE_KEYS: &[&[u8]] = &[
    b"authorization",
    b"token",
    b"api_key",
    b"apikey",
    b"x-api-key",
    b"password",
    b"secret",
    b"session",
    b"cookie",
    b"set-cookie",
];

// ── low-level byte helpers (unchanged public behaviour) ─────────────────────

fn is_value_delimiter(byte: u8) -> bool {
    matches!(
        byte,
        b' ' | b'\t' | b'\r' | b'\n' | b'&' | b';' | b',' | b'"' | b'\'' | b')' | b']' | b'}'
    )
}

fn key_match(bytes: &[u8], start: usize) -> Option<&'static [u8]> {
    SENSITIVE_KEYS.iter().copied().find(|key| {
        let end = start + key.len();
        end <= bytes.len() && bytes[start..end].eq_ignore_ascii_case(key)
    })
}

fn parse_value_start(payload: &[u8], key_start: usize, key: &[u8]) -> Option<(usize, bool)> {
    let mut index = key_start + key.len();
    let mut quoted_key = false;

    if payload.get(index) == Some(&b'"') {
        quoted_key = true;
        index += 1;
    }

    while payload.get(index).is_some_and(|b| b.is_ascii_whitespace()) {
        index += 1;
    }

    match payload.get(index)? {
        b'=' | b':' => index += 1,
        _ => return None,
    }

    while payload.get(index).is_some_and(|b| b.is_ascii_whitespace()) {
        index += 1;
    }

    let mut quoted_value = false;
    if payload.get(index) == Some(&b'"') {
        quoted_value = true;
        index += 1;
    }

    if payload[key_start..key_start + key.len()].eq_ignore_ascii_case(b"authorization")
        && payload[index..]
            .get(..7)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"bearer "))
    {
        index += 7;
        if index < payload.len() {
            index += 1;
        }
    }

    Some((index, quoted_key || quoted_value))
}

/// Replaces secret-like value fragments with `x` bytes while preserving payload
/// length and delimiter placement.
pub fn sanitize_payload_fragments(payload: &[u8]) -> Vec<u8> {
    let mut sanitized = payload.to_vec();
    let mut index = 0;

    while index < payload.len() {
        let Some(key) = key_match(payload, index) else {
            index += 1;
            continue;
        };

        let Some((mut value_index, quoted_value)) = parse_value_start(payload, index, key) else {
            index += 1;
            continue;
        };

        while value_index < payload.len()
            && !is_value_delimiter(payload[value_index])
            && !(quoted_value && payload[value_index] == b'"')
        {
            sanitized[value_index] = b'x';
            value_index += 1;
        }

        index = value_index;
    }

    sanitized
}

// ═══════════════════════════════════════════════════════════════════════════
//  Pipeline types
// ═══════════════════════════════════════════════════════════════════════════

/// Strategy used by a [`SanitizationRule`] when a match is found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedactionStrategy {
    /// Overwrite matched value bytes with `x` (preserves payload length).
    ReplaceWithX,
    /// Replace the matched value with a fixed sentinel string.
    ReplaceWithCanonical(&'static str),
}

/// A single ordered sanitization rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SanitizationRule {
    /// Human-readable category for reporting (e.g. `"credential"`, `"path"`).
    pub category: &'static str,
    /// Byte pattern that triggers this rule. Match is case-insensitive.
    pub pattern: &'static [u8],
    /// How to redact the value that follows the pattern.
    pub strategy: RedactionStrategy,
    /// When `true` the rule expects a `:` or `=` separator after the pattern.
    pub expect_separator: bool,
}

impl SanitizationRule {
    const fn new(
        category: &'static str,
        pattern: &'static [u8],
        strategy: RedactionStrategy,
        expect_separator: bool,
    ) -> Self {
        Self {
            category,
            pattern,
            strategy,
            expect_separator,
        }
    }
}

/// Immutable, ordered set of rules applied by the pipeline.
///
/// Rules are stored in a `Vec` and scanned left-to-right so that output is
/// deterministic for identical input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SanitizationContext {
    rules: Vec<SanitizationRule>,
}

impl Default for SanitizationContext {
    fn default() -> Self {
        Self::new()
    }
}

impl SanitizationContext {
    /// Creates the default public-sharing context with all built-in rules.
    pub fn new() -> Self {
        let rules = vec![
            // ── credentials ──────────────────────────────────────────────
            SanitizationRule::new("credential", b"authorization", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"token", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"api_key", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"apikey", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"x-api-key", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"password", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"secret", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"session", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"cookie", RedactionStrategy::ReplaceWithX, true),
            SanitizationRule::new("credential", b"set-cookie", RedactionStrategy::ReplaceWithX, true),
            // ── system identifiers ────────────────────────────────────────
            SanitizationRule::new("hostname", b"host=", RedactionStrategy::ReplaceWithCanonical("[HOST]"), false),
            SanitizationRule::new("hostname", b"hostname=", RedactionStrategy::ReplaceWithCanonical("[HOST]"), false),
            SanitizationRule::new("hostname", b"node_id=", RedactionStrategy::ReplaceWithCanonical("[HOST]"), false),
            SanitizationRule::new("hostname", b"instance=", RedactionStrategy::ReplaceWithCanonical("[HOST]"), false),
            // ── environment paths ─────────────────────────────────────────
            SanitizationRule::new("path", b"/home/", RedactionStrategy::ReplaceWithCanonical("[PATH]"), false),
            SanitizationRule::new("path", b"/Users/", RedactionStrategy::ReplaceWithCanonical("[PATH]"), false),
            SanitizationRule::new("path", b"/tmp/", RedactionStrategy::ReplaceWithCanonical("[PATH]"), false),
            SanitizationRule::new("path", b"/var/", RedactionStrategy::ReplaceWithCanonical("[PATH]"), false),
            SanitizationRule::new("path", b"C:\\", RedactionStrategy::ReplaceWithCanonical("[PATH]"), false),
        ];
        Self { rules }
    }

    /// Builds a context from an explicit rule list.
    pub fn with_rules(rules: Vec<SanitizationRule>) -> Self {
        Self { rules }
    }
}

/// Summary of redactions performed during a sanitization pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SanitizationReport {
    /// Total number of redacted fragments.
    pub redaction_count: usize,
    /// Map from rule category to occurrences.
    pub redaction_categories: HashMap<String, usize>,
}

impl SanitizationReport {
    fn empty() -> Self {
        Self {
            redaction_count: 0,
            redaction_categories: HashMap::new(),
        }
    }

    fn record(&mut self, category: &str) {
        self.redaction_count += 1;
        *self.redaction_categories
            .entry(category.to_string())
            .or_insert(0) += 1;
    }
}

/// Error raised when sanitization validation fails.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SanitizationError {
    /// The failure classification category changed after redaction.
    CategoryChanged {
        original: String,
        sanitized: String,
    },
    /// The sanitized bundle failed to round-trip through the loader.
    LoadFailed(String),
}

impl std::fmt::Display for SanitizationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SanitizationError::CategoryChanged { original, sanitized } => {
                write!(f, "sanitization changed failure category: {original} -> {sanitized}")
            }
            SanitizationError::LoadFailed(msg) => {
                write!(f, "sanitized bundle failed loader round-trip: {msg}")
            }
        }
    }
}

impl std::error::Error for SanitizationError {}

// ═══════════════════════════════════════════════════════════════════════════
//  Pipeline implementation
// ═══════════════════════════════════════════════════════════════════════════

/// Applies `context` rules to `payload` and returns the redacted bytes plus a
/// [`SanitizationReport`].
///
/// The scan is deterministic: rules are evaluated left-to-right in declaration
/// order. When a rule matches, its [`RedactionStrategy`] is applied and the
/// scan advances past the replacement so that overlapping matches are safe.
pub fn sanitize_payload_with_context(payload: &[u8], context: &SanitizationContext) -> (Vec<u8>, SanitizationReport) {
    let mut out = payload.to_vec();
    let mut report = SanitizationReport::empty();
    let mut index = 0;

    while index < out.len() {
        let mut matched = false;
        for rule in &context.rules {
            let pat = rule.pattern;
            let end = index + pat.len();
            if end > out.len() {
                continue;
            }
            if !out[index..end].eq_ignore_ascii_case(pat) {
                continue;
            }

            // Determine where the value starts.
            let mut value_start = end;
            if rule.expect_separator {
                // skip optional quote after the key pattern
                if out.get(value_start) == Some(&b'"') {
                    value_start += 1;
                }
                while out.get(value_start).is_some_and(|b| b.is_ascii_whitespace()) {
                    value_start += 1;
                }
                match out.get(value_start) {
                    Some(b'=') | Some(b':') => value_start += 1,
                    _ => continue, // not a valid key-value, skip this rule at this position
                }
                while out.get(value_start).is_some_and(|b| b.is_ascii_whitespace()) {
                    value_start += 1;
                }
                // Skip optional opening quote on value
                let mut quoted = false;
                if out.get(value_start) == Some(&b'"') {
                    quoted = true;
                    value_start += 1;
                }
                // Bearer special-case for Authorization header
                if pat.eq_ignore_ascii_case(b"authorization") {
                    if out[value_start..]
                        .get(..7)
                        .is_some_and(|p| p.eq_ignore_ascii_case(b"bearer "))
                    {
                        value_start += 7;
                        if value_start < out.len() {
                            value_start += 1; // skip leading space after "bearer"
                        }
                    }
                }

                let mut value_end = value_start;
                while value_end < out.len()
                    && !is_value_delimiter(out[value_end])
                    && !(quoted && out[value_end] == b'"')
                {
                    value_end += 1;
                }

                match rule.strategy {
                    RedactionStrategy::ReplaceWithX => {
                        for i in value_start..value_end {
                            out[i] = b'x';
                        }
                    }
                    RedactionStrategy::ReplaceWithCanonical(sentinel) => {
                        let replacement = sentinel.as_bytes();
                        let len_diff = replacement.len() as isize - (value_end - value_start) as isize;
                        if len_diff == 0 {
                            out[value_start..value_end].copy_from_slice(replacement);
                        } else if len_diff < 0 {
                            let new_end = value_start + replacement.len();
                            out[value_start..new_end].copy_from_slice(replacement);
                            out.copy_within(new_end..value_end, new_end);
                            out.truncate(out.len() - (-len_diff as usize));
                        } else {
                            let new_end = value_start + replacement.len();
                            out.resize(out.len() + len_diff as usize, 0);
                            out.copy_within(value_end..(out.len() - len_diff as usize), new_end);
                            out[value_start..new_end].copy_from_slice(replacement);
                        }
                        // Adjust index to account for length change
                        index = value_start + replacement.len();
                        matched = true;
                        report.record(rule.category);
                        break; // restart rule scanning at new index
                    }
                }

                if !matched {
                    index = value_end;
                    matched = true;
                    report.record(rule.category);
                    break;
                }
            } else {
                // No separator expected: the pattern itself is the prefix to replace.
                // Consume until next delimiter or whitespace.
                let mut value_end = value_start;
                while value_end < out.len() && !is_value_delimiter(out[value_end]) {
                    value_end += 1;
                }
                match rule.strategy {
                    RedactionStrategy::ReplaceWithX => {
                        for i in value_start..value_end {
                            out[i] = b'x';
                        }
                    }
                    RedactionStrategy::ReplaceWithCanonical(sentinel) => {
                        let replacement = sentinel.as_bytes();
                        let len_diff = replacement.len() as isize - (value_end - value_start) as isize;
                        if len_diff == 0 {
                            out[value_start..value_end].copy_from_slice(replacement);
                        } else if len_diff < 0 {
                            let new_end = value_start + replacement.len();
                            out[value_start..new_end].copy_from_slice(replacement);
                            out.copy_within(new_end..value_end, new_end);
                            out.truncate(out.len() - (-len_diff as usize));
                        } else {
                            let new_end = value_start + replacement.len();
                            out.resize(out.len() + len_diff as usize, 0);
                            out.copy_within(value_end..(out.len() - len_diff as usize), new_end);
                            out[value_start..new_end].copy_from_slice(replacement);
                        }
                        index = value_start + replacement.len();
                        matched = true;
                        report.record(rule.category);
                        break;
                    }
                }
                if !matched {
                    index = value_end;
                    matched = true;
                    report.record(rule.category);
                    break;
                }
            }
        }
        if !matched {
            index += 1;
        }
    }

    (out, report)
}

/// Sanitizes a seed payload using the given context.
pub fn sanitize_seed_with_context(seed: &CaseSeed, context: &SanitizationContext) -> (CaseSeed, SanitizationReport) {
    let (payload, report) = sanitize_payload_with_context(&seed.payload, context);
    (
        CaseSeed {
            id: seed.id,
            payload,
        },
        report,
    )
}

/// Attempts lightweight JSON-aware stripping of sensitive keys from a JSON
/// payload. Falls back to byte-level sanitization when the payload is not
/// valid JSON.
fn sanitize_json_payload(payload: &[u8], context: &SanitizationContext) -> (Vec<u8>, SanitizationReport) {
    let text = match std::str::from_utf8(payload) {
        Ok(t) => t,
        Err(_) => return sanitize_payload_with_context(payload, context),
    };
    let mut value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return sanitize_payload_with_context(payload, context),
    };

    let mut report = SanitizationReport::empty();
    strip_sensitive_keys_json(&mut value, context, &mut report);

    let out = serde_json::to_vec(&value).unwrap_or_else(|_| payload.to_vec());
    (out, report)
}

fn strip_sensitive_keys_json(value: &mut serde_json::Value, context: &SanitizationContext, report: &mut SanitizationReport) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                for rule in &context.rules {
                    if key.as_bytes().eq_ignore_ascii_case(rule.pattern) {
                        *val = serde_json::Value::String("[REDACTED]".to_string());
                        report.record(rule.category);
                        break;
                    }
                }
                strip_sensitive_keys_json(val, context, report);
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                strip_sensitive_keys_json(item, context, report);
            }
        }
        _ => {}
    }
}

/// Sanitizes a [`CaseBundle`] using `context`.
///
/// Returns the sanitized bundle and a report. The seed signature is
/// recomputed from the redacted seed so that downstream consumers see a
/// consistent `CrashSignature`.
pub fn sanitize_bundle_with_context(
    bundle: &CaseBundle,
    context: &SanitizationContext,
) -> (CaseBundle, SanitizationReport) {
    let (seed, mut report) = sanitize_seed_with_context(&bundle.seed, context);

    let failure_payload = if bundle.failure_payload.is_empty() {
        bundle.failure_payload.clone()
    } else {
        let (fp, fp_report) = sanitize_json_payload(&bundle.failure_payload, context);
        merge_reports(&mut report, fp_report);
        fp
    };

    let sanitized = CaseBundle {
        signature: classify(&seed),
        seed,
        environment: bundle.environment.clone(),
        failure_payload,
        rpc_envelope: None,
    };

    (sanitized, report)
}

fn merge_reports(into: &mut SanitizationReport, other: SanitizationReport) {
    into.redaction_count += other.redaction_count;
    for (cat, count) in other.redaction_categories {
        *into.redaction_categories.entry(cat).or_insert(0) += count;
    }
}

/// Sanitizes a bundle and validates that the sanitized output still loads
/// correctly and preserves the failure classification category.
///
/// Returns `Err(SanitizationError::CategoryChanged)` if the category differs,
/// or `Err(SanitizationError::LoadFailed)` if JSON round-tripping fails.
pub fn sanitize_and_validate_bundle(
    bundle: &CaseBundle,
    context: &SanitizationContext,
) -> Result<(CaseBundle, SanitizationReport), SanitizationError> {
    let (sanitized, report) = sanitize_bundle_with_context(bundle, context);

    if sanitized.signature.category != bundle.signature.category {
        return Err(SanitizationError::CategoryChanged {
            original: bundle.signature.category.clone(),
            sanitized: sanitized.signature.category.clone(),
        });
    }

    // Round-trip through the document format to prove loader compatibility.
    let doc = CaseBundleDocument {
        schema: CASE_BUNDLE_SCHEMA_VERSION,
        seed: sanitized.seed.clone(),
        signature: sanitized.signature.clone(),
        environment: sanitized.environment.clone(),
        failure_payload: sanitized.failure_payload.clone(),
        rpc_envelope: None,
    };
    let json = serde_json::to_vec(&doc).map_err(|e| {
        SanitizationError::LoadFailed(format!("serialize: {e}"))
    })?;
    let loaded: CaseBundleDocument = serde_json::from_slice(&json).map_err(|e| {
        SanitizationError::LoadFailed(format!("deserialize: {e}"))
    })?;
    if loaded.seed != sanitized.seed {
        return Err(SanitizationError::LoadFailed(
            "seed mismatch after round-trip".to_string(),
        ));
    }

    Ok((sanitized, report))
}

// ═══════════════════════════════════════════════════════════════════════════
//  Legacy public API (now thin wrappers around the pipeline)
// ═══════════════════════════════════════════════════════════════════════════

/// Sanitizes a seed payload for public sharing while preserving ID and size.
pub fn sanitize_seed_for_sharing(seed: &CaseSeed) -> CaseSeed {
    sanitize_seed_with_context(seed, &SanitizationContext::default()).0
}

/// Sanitizes a bundle for public sharing and recomputes the signature from the
/// sanitized seed payload.
pub fn sanitize_bundle_for_sharing(bundle: &CaseBundle) -> CaseBundle {
    sanitize_bundle_with_context(bundle, &SanitizationContext::default()).0
}

/// Converts a bundle into a share-safe bundle document.
pub fn sanitize_bundle_document_for_sharing(bundle: &CaseBundle) -> CaseBundleDocument {
    let sanitized = sanitize_bundle_for_sharing(bundle);
    CaseBundleDocument {
        schema: CASE_BUNDLE_SCHEMA_VERSION,
        seed: sanitized.seed,
        signature: sanitized.signature,
        environment: sanitized.environment,
        failure_payload: sanitized.failure_payload,
        rpc_envelope: None,
    }
}

/// Serializes a share-safe bundle document as pretty JSON.
pub fn save_sanitized_case_bundle_json(bundle: &CaseBundle) -> Result<Vec<u8>, BundlePersistError> {
    let doc = sanitize_bundle_document_for_sharing(bundle);
    Ok(serde_json::to_vec_pretty(&doc)?)
}

/// Builds a scenario from a sanitized bundle for public sharing.
pub fn sanitized_failure_scenario(bundle: &CaseBundle, mode: impl Into<String>) -> FailureScenario {
    let sanitized = sanitize_bundle_for_sharing(bundle);
    FailureScenario::from_bundle(&sanitized, mode)
}

/// Exports a sanitized scenario as pretty JSON.
pub fn export_sanitized_scenario_json(
    bundle: &CaseBundle,
    mode: impl Into<String>,
) -> Result<String, serde_json::Error> {
    let scenario = sanitized_failure_scenario(bundle, mode);
    serde_json::to_string_pretty(&scenario)
}

/// Exports a sanitized suite as deterministically ordered JSON.
pub fn export_sanitized_suite_json(
    bundles: &[CaseBundle],
    mode: impl Into<String> + Clone,
) -> Result<String, serde_json::Error> {
    let mut scenarios: Vec<FailureScenario> = bundles
        .iter()
        .map(|b| {
            let sanitized = sanitize_bundle_for_sharing(b);
            FailureScenario::from_bundle(&sanitized, mode.clone())
        })
        .collect();
    scenarios.sort_by(|a, b| {
        a.seed_id
            .cmp(&b.seed_id)
            .then_with(|| a.failure_class.cmp(&b.failure_class))
            .then_with(|| a.input_payload.cmp(&b.input_payload))
            .then_with(|| a.mode.cmp(&b.mode))
    });
    serde_json::to_string_pretty(&scenarios)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute_signature_hash;

    #[test]
    fn sanitizes_query_style_secret_values_in_seed_payloads() {
        let seed = CaseSeed {
            id: 7,
            payload: b"user=demo&token=abcd1234&mode=replay".to_vec(),
        };

        let sanitized = sanitize_seed_for_sharing(&seed);

        assert_eq!(
            String::from_utf8(sanitized.payload).unwrap(),
            "user=demo&token=xxxxxxxx&mode=replay"
        );
    }

    #[test]
    fn sanitizes_json_style_secret_values_in_seed_payloads() {
        let seed = CaseSeed {
            id: 8,
            payload: br#"{"user":"demo","token":"abcd1234","mode":"replay"}"#.to_vec(),
        };

        let sanitized = sanitize_seed_for_sharing(&seed);

        assert_eq!(
            String::from_utf8(sanitized.payload).unwrap(),
            r#"{"user":"demo","token":"xxxxxxxx","mode":"replay"}"#
        );
    }

    #[test]
    fn sanitizes_header_style_secrets_in_failure_payloads() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 11,
                payload: b"ok=1".to_vec(),
            },
            signature: classify(&CaseSeed {
                id: 11,
                payload: b"ok=1".to_vec(),
            }),
            environment: None,
            failure_payload: b"Authorization: Bearer super-secret-token\npanic: trap".to_vec(),
            rpc_envelope: None,
        };

        let sanitized = sanitize_bundle_for_sharing(&bundle);

        assert_eq!(
            String::from_utf8(sanitized.failure_payload).unwrap(),
            "Authorization: Bearer sxxxxxxxxxxxxxxxxx\npanic: trap"
        );
    }

    #[test]
    fn sanitizes_set_cookie_and_api_key_style_fragments() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 12,
                payload: b"x-api-key: abcdef123456".to_vec(),
            },
            signature: classify(&CaseSeed {
                id: 12,
                payload: b"x-api-key: abcdef123456".to_vec(),
            }),
            environment: None,
            failure_payload: b"Set-Cookie: session=abc123; Path=/".to_vec(),
            rpc_envelope: None,
        };

        let sanitized = sanitize_bundle_for_sharing(&bundle);

        assert_eq!(
            String::from_utf8(sanitized.seed.payload).unwrap(),
            "x-api-key: xxxxxxxxxxxx"
        );
        assert_eq!(
            String::from_utf8(sanitized.failure_payload).unwrap(),
            "Set-Cookie: xxxxxxxxxxxxxx; Path=/"
        );
    }

    #[test]
    fn sanitization_preserves_payload_length_and_failure_class() {
        let payload = b"token=abcd1234".to_vec();
        let seed = CaseSeed {
            id: 42,
            payload: payload.clone(),
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: classify(&seed),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let sanitized = sanitize_bundle_for_sharing(&bundle);

        assert_eq!(sanitized.seed.payload.len(), payload.len());
        assert_eq!(sanitized.signature.category, bundle.signature.category);
        assert_ne!(sanitized.seed.payload, bundle.seed.payload);
    }

    #[test]
    fn sanitized_bundle_json_omits_raw_secret_fragments() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 5,
                payload: b"token=abcd1234".to_vec(),
            },
            signature: classify(&CaseSeed {
                id: 5,
                payload: b"token=abcd1234".to_vec(),
            }),
            environment: None,
            failure_payload: b"cookie=session-123".to_vec(),
            rpc_envelope: None,
        };

        let json = String::from_utf8(save_sanitized_case_bundle_json(&bundle).unwrap()).unwrap();

        assert!(!json.contains("abcd1234"));
        assert!(!json.contains("session-123"));
        assert!(json.contains("\"schema\""));
    }

    #[test]
    fn sanitized_exports_preserve_lengths_for_shared_fixture_pipeline() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 15,
                payload: br#"{"token":"abcd1234","cookie":"session-123"}"#.to_vec(),
            },
            signature: classify(&CaseSeed {
                id: 15,
                payload: br#"{"token":"abcd1234","cookie":"session-123"}"#.to_vec(),
            }),
            environment: None,
            failure_payload: b"Authorization: Bearer super-secret-token".to_vec(),
            rpc_envelope: None,
        };

        let sanitized_bundle = sanitize_bundle_for_sharing(&bundle);
        let scenario = sanitized_failure_scenario(&bundle, "public");

        assert_eq!(
            sanitized_bundle.seed.payload.len(),
            bundle.seed.payload.len()
        );
        assert_eq!(
            sanitized_bundle.failure_payload.len(),
            bundle.failure_payload.len()
        );
        assert_eq!(
            hex::decode(&scenario.input_payload).unwrap(),
            sanitized_bundle.seed.payload
        );
    }

    #[test]
    fn sanitized_scenario_recomputes_payload_hex_from_scrubbed_seed() {
        let bundle = CaseBundle {
            seed: CaseSeed {
                id: 99,
                payload: b"token=abcd".to_vec(),
            },
            signature: classify(&CaseSeed {
                id: 99,
                payload: b"token=abcd".to_vec(),
            }),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let scenario = sanitized_failure_scenario(&bundle, "public");

        assert_eq!(scenario.seed_id, 99);
        assert_eq!(scenario.mode, "public");
        assert_eq!(scenario.failure_class, "runtime-failure");
        assert_eq!(scenario.input_payload, hex::encode(b"token=xxxx"));
        assert_ne!(
            compute_signature_hash("runtime-failure", b"token=abcd"),
            compute_signature_hash(
                "runtime-failure",
                &hex::decode(&scenario.input_payload).unwrap()
            )
        );
    }

    // ── pipeline unit tests ───────────────────────────────────────────────────

    #[test]
    fn context_replaces_path_prefixes_with_canonical() {
        let ctx = SanitizationContext::default();
        let (out, report) = sanitize_payload_with_context(b"file=/home/alice/data.txt", &ctx);
        assert_eq!(String::from_utf8(out).unwrap(), "file=[PATH]");
        assert_eq!(report.redaction_count, 1);
        assert_eq!(report.redaction_categories.get("path"), Some(&1));
    }

    #[test]
    fn context_replaces_hostname_with_canonical() {
        let ctx = SanitizationContext::default();
        let (out, report) = sanitize_payload_with_context(b"host=prod-node-42.internal", &ctx);
        assert_eq!(String::from_utf8(out).unwrap(), "host=[HOST]");
        assert_eq!(report.redaction_count, 1);
        assert_eq!(report.redaction_categories.get("hostname"), Some(&1));
    }

    #[test]
    fn context_preserves_credentials_as_length_preserve_x() {
        let ctx = SanitizationContext::default();
        let (out, report) = sanitize_payload_with_context(b"token=secret123", &ctx);
        assert_eq!(String::from_utf8(out).unwrap(), "token=xxxxxxxxx");
        assert_eq!(report.redaction_count, 1);
        assert_eq!(report.redaction_categories.get("credential"), Some(&1));
    }

    #[test]
    fn determinism_same_input_same_output_across_runs() {
        let ctx = SanitizationContext::default();
        let input = b"token=abc&host=node1&file=/tmp/x";
        let (out1, rep1) = sanitize_payload_with_context(input, &ctx);
        for _ in 0..100 {
            let (out2, rep2) = sanitize_payload_with_context(input, &ctx);
            assert_eq!(out1, out2);
            assert_eq!(rep1, rep2);
        }
    }

    #[test]
    fn binary_payload_no_panic_and_still_redacts() {
        let ctx = SanitizationContext::default();
        let mut input: Vec<u8> = vec![0x00, 0xFF, 0xFE];
        input.extend_from_slice(b"token=secret");
        input.extend_from_slice(&[0xAB, 0xCD]);
        let (out, report) = sanitize_payload_with_context(&input, &ctx);
        assert_eq!(out.len(), input.len());
        assert_eq!(report.redaction_count, 1);
        assert!(!out.windows(6).any(|w| w == b"secret"));
    }

    #[test]
    fn empty_payload_no_op_and_empty_report() {
        let ctx = SanitizationContext::default();
        let (out, report) = sanitize_payload_with_context(b"", &ctx);
        assert!(out.is_empty());
        assert_eq!(report.redaction_count, 0);
        assert!(report.redaction_categories.is_empty());
    }

    #[test]
    fn repeated_targets_each_independently_redacted() {
        let ctx = SanitizationContext::default();
        let input = b"token=a&token=b&token=c";
        let (out, report) = sanitize_payload_with_context(input, &ctx);
        assert_eq!(String::from_utf8(out).unwrap(), "token=x&token=x&token=x");
        assert_eq!(report.redaction_count, 3);
    }

    #[test]
    fn multiple_categories_in_one_payload() {
        let ctx = SanitizationContext::default();
        let input = b"token=abc&host=node1&file=/tmp/x";
        let (_, report) = sanitize_payload_with_context(input, &ctx);
        assert_eq!(report.redaction_count, 3);
        assert_eq!(report.redaction_categories.get("credential"), Some(&1));
        assert_eq!(report.redaction_categories.get("hostname"), Some(&1));
        assert_eq!(report.redaction_categories.get("path"), Some(&1));
    }

    #[test]
    fn json_failure_payload_strips_nested_sensitive_keys() {
        let ctx = SanitizationContext::default();
        let seed = CaseSeed {
            id: 1,
            payload: b"ok".to_vec(),
        };
        let failure = br#"{"outer":{"token":"secret","data":42},"api_key":"key123"}"#;
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: classify(&seed),
            environment: None,
            failure_payload: failure.to_vec(),
            rpc_envelope: None,
        };

        let (sanitized, report) = sanitize_bundle_with_context(&bundle, &ctx);
        let json_str = String::from_utf8(sanitized.failure_payload).unwrap();
        assert!(json_str.contains("[REDACTED]"));
        assert!(!json_str.contains("secret"));
        assert!(!json_str.contains("key123"));
        assert!(json_str.contains("42"));
        assert_eq!(report.redaction_categories.get("credential"), Some(&2));
    }

    #[test]
    fn non_json_failure_payload_falls_back_to_byte_scan() {
        let ctx = SanitizationContext::default();
        let seed = CaseSeed {
            id: 1,
            payload: b"ok".to_vec(),
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: classify(&seed),
            environment: None,
            failure_payload: b"token=secret123\nhost=prod".to_vec(),
            rpc_envelope: None,
        };

        let (sanitized, report) = sanitize_bundle_with_context(&bundle, &ctx);
        let text = String::from_utf8(sanitized.failure_payload).unwrap();
        assert!(!text.contains("secret123"));
        assert!(!text.contains("prod"));
        assert_eq!(report.redaction_categories.get("credential"), Some(&1));
        assert_eq!(report.redaction_categories.get("hostname"), Some(&1));
    }

    #[test]
    fn sanitize_and_validate_bundle_roundtrips_and_preserves_category() {
        let seed = CaseSeed {
            id: 77,
            payload: b"token=secret".to_vec(),
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: classify(&seed),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let result = sanitize_and_validate_bundle(&bundle, &SanitizationContext::default());
        assert!(result.is_ok());
        let (sanitized, report) = result.unwrap();
        assert_eq!(sanitized.signature.category, bundle.signature.category);
        assert_eq!(report.redaction_count, 1);
    }

    #[test]
    fn sanitized_suite_export_is_deterministic() {
        let make_bundle = |id: u64| {
            let seed = CaseSeed {
                id,
                payload: b"token=secret".to_vec(),
            };
            CaseBundle {
                seed: seed.clone(),
                signature: classify(&seed),
                environment: None,
                failure_payload: vec![],
                rpc_envelope: None,
            }
        };
        let bundles = vec![make_bundle(3), make_bundle(1), make_bundle(2)];

        let json1 = export_sanitized_suite_json(&bundles, "public").unwrap();
        let json2 = export_sanitized_suite_json(&bundles, "public").unwrap();
        assert_eq!(json1, json2);
        // Verify sorted order by seed_id
        assert!(json1.find("\"seed_id\": 1").unwrap() < json1.find("\"seed_id\": 2").unwrap());
        assert!(json1.find("\"seed_id\": 2").unwrap() < json1.find("\"seed_id\": 3").unwrap());
    }

    #[test]
    fn sanitize_and_validate_bundle_rejects_category_change() {
        // Create a context that overwrites the first payload byte, which
        // changes taxonomy classification.
        let destructive_rule = SanitizationRule {
            category: "test",
            pattern: b"o",
            strategy: RedactionStrategy::ReplaceWithX,
            expect_separator: false,
        };
        let ctx = SanitizationContext::with_rules(vec![destructive_rule]);
        let seed = CaseSeed {
            id: 1,
            payload: b"ok".to_vec(),
        };
        let bundle = CaseBundle {
            seed: seed.clone(),
            signature: classify(&seed),
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let result = sanitize_and_validate_bundle(&bundle, &ctx);
        assert!(
            matches!(result, Err(SanitizationError::CategoryChanged { .. })),
            "expected CategoryChanged error, got {:?}",
            result
        );
    }

    #[test]
    fn sanitize_payload_with_context_windows_path() {
        let ctx = SanitizationContext::default();
        let (out, report) = sanitize_payload_with_context(b"path=C:\\Users\\Alice\\file.txt", &ctx);
        assert_eq!(String::from_utf8(out).unwrap(), "path=[PATH]");
        assert_eq!(report.redaction_count, 1);
    }
}
