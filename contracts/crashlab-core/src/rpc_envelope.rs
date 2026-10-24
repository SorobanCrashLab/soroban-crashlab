//! RPC request/response envelope capture for reproducibility auditing.
//!
//! This module provides types for capturing and storing sanitized RPC
//! request and response envelopes. Sensitive fields are automatically
//! redacted to prevent credential leakage while maintaining enough
//! information for reproducibility debugging.

use crate::HostDiagnostics;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A captured RPC request envelope with sensitive fields redacted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RpcRequestEnvelope {
    /// The RPC method name.
    pub method: String,
    /// The request parameters with sensitive fields redacted.
    pub params: Value,
    /// List of field paths that were redacted.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redacted_fields: Vec<String>,
}

impl RpcRequestEnvelope {
    /// Creates a new request envelope with automatic redaction of sensitive fields.
    pub fn new(method: impl Into<String>, params: Value) -> Self {
        let method = method.into();
        let mut redacted_fields = Vec::new();
        let sanitized_params = redact_sensitive_fields(&params, "", &mut redacted_fields);
        Self {
            method,
            params: sanitized_params,
            redacted_fields,
        }
    }

    /// Legacy constructor name; captures are now redacted like [`Self::new`].
    pub fn new_unsanitized(method: impl Into<String>, params: Value) -> Self {
        Self::new(method, params)
    }
}

/// A captured RPC response envelope with sensitive fields redacted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RpcResponseEnvelope {
    /// The response status (e.g., "success", "error").
    pub status: String,
    /// The response result data with sensitive fields redacted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// Error details if the response indicates a failure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    /// List of field paths that were redacted.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redacted_fields: Vec<String>,
    /// Optional structured host diagnostics associated with this RPC result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_diagnostics: Option<HostDiagnostics>,
}

impl RpcResponseEnvelope {
    /// Creates a new successful response envelope with automatic redaction.
    pub fn success(result: Value) -> Self {
        let mut redacted_fields = Vec::new();
        let sanitized_result = redact_sensitive_fields(&result, "", &mut redacted_fields);
        Self {
            status: "success".to_string(),
            result: Some(sanitized_result),
            error: None,
            redacted_fields,
            host_diagnostics: None,
        }
    }

    /// Creates a new error response envelope with automatic redaction.
    pub fn error(error: Value) -> Self {
        let mut redacted_fields = Vec::new();
        let sanitized_error = redact_sensitive_fields(&error, "", &mut redacted_fields);
        Self {
            status: "error".to_string(),
            result: None,
            error: Some(sanitized_error),
            redacted_fields,
            host_diagnostics: None,
        }
    }

    /// Attaches structured diagnostics without changing the captured response
    /// payload or its redaction metadata.
    pub fn with_host_diagnostics(mut self, diagnostics: HostDiagnostics) -> Self {
        self.host_diagnostics = Some(diagnostics);
        self
    }

    /// Legacy constructor name; captures are now redacted like the other constructors.
    pub fn new_unsanitized(
        status: impl Into<String>,
        result: Option<Value>,
        error: Option<Value>,
    ) -> Self {
        let mut redacted_fields = Vec::new();
        let result = result.map(|value| redact_sensitive_fields(&value, "", &mut redacted_fields));
        let error = error.map(|value| redact_sensitive_fields(&value, "", &mut redacted_fields));
        Self {
            status: status.into(),
            result,
            error,
            redacted_fields,
            host_diagnostics: None,
        }
    }
}

/// A complete RPC envelope capture containing both request and response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RpcEnvelopeCapture {
    /// The captured request envelope.
    pub request: RpcRequestEnvelope,
    /// The captured response envelope.
    pub response: RpcResponseEnvelope,
    /// ISO 8601 timestamp when the envelope was captured.
    pub captured_at: String,
}

impl RpcEnvelopeCapture {
    /// Creates a new envelope capture with the current timestamp.
    pub fn new(request: RpcRequestEnvelope, response: RpcResponseEnvelope) -> Self {
        Self {
            request,
            response,
            captured_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Creates a new envelope capture with a specific timestamp (for testing).
    #[cfg(test)]
    pub fn new_with_timestamp(
        request: RpcRequestEnvelope,
        response: RpcResponseEnvelope,
        captured_at: impl Into<String>,
    ) -> Self {
        Self {
            request,
            response,
            captured_at: captured_at.into(),
        }
    }

    /// Returns true if any fields were redacted from either request or response.
    pub fn has_redactions(&self) -> bool {
        !self.request.redacted_fields.is_empty() || !self.response.redacted_fields.is_empty()
    }

    /// Returns a combined list of all redacted field paths.
    pub fn all_redacted_fields(&self) -> Vec<&String> {
        self.request
            .redacted_fields
            .iter()
            .chain(self.response.redacted_fields.iter())
            .collect()
    }
}

/// Recursively redacts sensitive fields from a JSON value.
///
/// Field names are compared case-insensitively against known sensitive patterns.
/// Returns a new Value with sensitive fields replaced by `[REDACTED]`.
fn redact_sensitive_fields(value: &Value, path: &str, redacted: &mut Vec<String>) -> Value {
    let (sanitized, fields) = crate::redact::redact_json_value(value);
    redacted.extend(fields.into_iter().map(|field| {
        if path.is_empty() {
            field
        } else {
            format!("{path}.{field}")
        }
    }));
    sanitized
}

fn is_sensitive_field(field_name: &str) -> bool {
    crate::redact::is_sensitive_field(field_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_envelope_redacts_authorization() {
        let params = serde_json::json!({
            "account": "GABC123",
            "authorization": "secret_token_123",
            "amount": 100
        });
        let envelope = RpcRequestEnvelope::new("submitTransaction", params);

        assert_eq!(envelope.method, "submitTransaction");
        assert_eq!(envelope.params["authorization"], "[REDACTED]");
        assert_eq!(envelope.params["account"], "GABC123");
        assert_eq!(envelope.params["amount"], 100);
        assert!(envelope
            .redacted_fields
            .contains(&"authorization".to_string()));
    }

    #[test]
    fn request_envelope_redacts_nested_sensitive_fields() {
        let params = serde_json::json!({
            "transaction": {
                "sourceAccount": "GABC123",
                "signature": "base64sigdata",
                "operations": [
                    {
                        "type": "payment",
                        "secretKey": "SXXX"
                    }
                ]
            }
        });
        let envelope = RpcRequestEnvelope::new("simulateTransaction", params);

        assert_eq!(envelope.params["transaction"]["signature"], "[REDACTED]");
        assert_eq!(
            envelope.params["transaction"]["operations"][0]["secretKey"],
            "[REDACTED]"
        );
        assert!(envelope
            .redacted_fields
            .contains(&"transaction.signature".to_string()));
        assert!(envelope
            .redacted_fields
            .contains(&"transaction.operations[0].secretKey".to_string()));
    }

    #[test]
    fn response_envelope_redacts_private_key() {
        let result = serde_json::json!({
            "account": "GABC123",
            "privateKey": "should_be_hidden"
        });
        let envelope = RpcResponseEnvelope::success(result);

        assert_eq!(envelope.status, "success");
        assert_eq!(
            envelope.result.as_ref().unwrap()["privateKey"],
            "[REDACTED]"
        );
        assert!(envelope.redacted_fields.contains(&"privateKey".to_string()));
    }

    #[test]
    fn response_envelope_preserves_non_sensitive_data() {
        let result = serde_json::json!({
            "ledger": 12345,
            "hash": "abc123",
            "result_meta_xdr": "AAAA"
        });
        let envelope = RpcResponseEnvelope::success(result);

        assert!(envelope.redacted_fields.is_empty());
        assert_eq!(envelope.result.as_ref().unwrap()["ledger"], 12345);
        assert_eq!(envelope.result.as_ref().unwrap()["hash"], "abc123");
    }

    #[test]
    fn is_sensitive_field_matches_case_insensitive() {
        assert!(is_sensitive_field("Authorization"));
        assert!(is_sensitive_field("authorization"));
        assert!(is_sensitive_field("auth_token"));
        assert!(is_sensitive_field("mySecretKey"));
        assert!(is_sensitive_field("private_key"));
        // Note: "public_key" contains "key" which is a sensitive pattern
        assert!(is_sensitive_field("public_key"));
        assert!(!is_sensitive_field("account"));
        assert!(!is_sensitive_field("ledger"));
    }

    #[test]
    fn envelope_capture_tracks_redactions() {
        let request = RpcRequestEnvelope::new("submit", serde_json::json!({ "auth": "secret" }));
        let response = RpcResponseEnvelope::success(serde_json::json!({ "result": "ok" }));

        let capture =
            RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-01-01T00:00:00Z");

        assert!(capture.has_redactions());
        assert_eq!(capture.all_redacted_fields().len(), 1);
        assert!(capture.all_redacted_fields().contains(&&"auth".to_string()));
    }

    #[test]
    fn envelope_capture_no_redactions_when_clean() {
        let request = RpcRequestEnvelope::new_unsanitized(
            "getLedger",
            serde_json::json!({ "sequence": 123 }),
        );
        let response = RpcResponseEnvelope::new_unsanitized(
            "success",
            Some(serde_json::json!({ "ledger": 123 })),
            None,
        );

        let capture =
            RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-01-01T00:00:00Z");

        assert!(!capture.has_redactions());
        assert!(capture.all_redacted_fields().is_empty());
    }

    #[test]
    fn error_response_redacts_sensitive_fields() {
        let error = serde_json::json!({
            "code": -32600,
            "message": "Invalid request",
            "data": {
                "token": "should_be_hidden",
                "details": "some error"
            }
        });
        let envelope = RpcResponseEnvelope::error(error);

        assert_eq!(envelope.status, "error");
        assert_eq!(
            envelope.error.as_ref().unwrap()["data"]["token"],
            "[REDACTED]"
        );
        assert!(envelope.redacted_fields.contains(&"data.token".to_string()));
    }

    #[test]
    fn redaction_handles_arrays_of_objects() {
        let params = serde_json::json!({
            "operations": [
                { "type": "payment", "secret": "s1" },
                { "type": "offer", "secret": "s2" }
            ]
        });
        let envelope = RpcRequestEnvelope::new("batchSubmit", params);

        assert_eq!(envelope.params["operations"][0]["secret"], "[REDACTED]");
        assert_eq!(envelope.params["operations"][1]["secret"], "[REDACTED]");
        assert!(envelope
            .redacted_fields
            .contains(&"operations[0].secret".to_string()));
        assert!(envelope
            .redacted_fields
            .contains(&"operations[1].secret".to_string()));
    }

    #[test]
    fn serialization_roundtrip_preserves_redacted_data() {
        let request = RpcRequestEnvelope::new(
            "test",
            serde_json::json!({ "password": "hunter2", "user": "alice" }),
        );
        let response = RpcResponseEnvelope::success(serde_json::json!({ "id": 1 }));
        let capture =
            RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-03-15T10:30:00Z");

        let json = serde_json::to_string(&capture).unwrap();
        let deserialized: RpcEnvelopeCapture = serde_json::from_str(&json).unwrap();

        assert_eq!(capture, deserialized);
        assert!(deserialized.has_redactions());
        assert_eq!(deserialized.request.params["password"], "[REDACTED]");
    }

    #[test]
    fn response_host_diagnostics_round_trip_and_old_data_defaults_to_none() {
        let diagnostics = HostDiagnostics {
            error_code: Some(9),
            error_type: Some(crate::HostErrorType::Budget),
            frame_summary: Some("top-level entrypoint: transfer".to_string()),
            cpu_instruction_cost: Some(123),
            ..HostDiagnostics::default()
        };
        let response = RpcResponseEnvelope::error(serde_json::json!({"code": 1}))
            .with_host_diagnostics(diagnostics.clone());

        let json = serde_json::to_string(&response).expect("serialize");
        let round_trip: RpcResponseEnvelope = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(round_trip.host_diagnostics, Some(diagnostics));

        let mut legacy = serde_json::to_value(&response).expect("serialize legacy shape");
        legacy
            .as_object_mut()
            .expect("response object")
            .remove("host_diagnostics");
        let legacy: RpcResponseEnvelope =
            serde_json::from_value(legacy).expect("missing optional field defaults");
        assert_eq!(legacy.host_diagnostics, None);
    }
}
