//! Sanitization helpers for share-safe fixture export.
//!
//! Public fixtures should keep enough structure to reproduce a failure class
//! without copying obvious credentials or session material into issue trackers.

use crate::bundle_persist::{BundlePersistError, CaseBundleDocument, CASE_BUNDLE_SCHEMA_VERSION};
use crate::scenario_export::FailureScenario;
use crate::{classify, CaseBundle, CaseSeed};

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

/// Sanitizes a seed payload for public sharing while preserving ID and size.
pub fn sanitize_seed_for_sharing(seed: &CaseSeed) -> CaseSeed {
    CaseSeed {
        id: seed.id,
        payload: sanitize_payload_fragments(&seed.payload),
    }
}

/// Sanitizes a bundle for public sharing and recomputes the signature from the
/// sanitized seed payload.
pub fn sanitize_bundle_for_sharing(bundle: &CaseBundle) -> CaseBundle {
    let seed = sanitize_seed_for_sharing(&bundle.seed);
    CaseBundle {
        signature: classify(&seed),
        seed,
        environment: bundle.environment.clone(),
        failure_payload: sanitize_payload_fragments(&bundle.failure_payload),
        rpc_envelope: None,
    }
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
}
