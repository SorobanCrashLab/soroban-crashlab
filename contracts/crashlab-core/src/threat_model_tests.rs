//! Security tests for threat model validation
//!
//! These tests validate mitigations for threats identified in
//! docs/THREAT_MODEL_ARTIFACT_HANDLING.md

#[cfg(test)]
mod threat_model_tests {
    use crate::*;

    // ── T-1: Path Traversal Prevention ────────────────────────────────────────

    #[test]
    fn signature_hash_produces_safe_filename() {
        let hash = compute_signature_hash("runtime-failure", b"../../etc/passwd");
        let filename = format!("{:016x}.json", hash);
        
        // Verify no path separators
        assert!(!filename.contains('/'));
        assert!(!filename.contains('\\'));
        assert!(!filename.contains('\0'));
        
        // Verify it's a valid hex string
        assert!(filename.chars().all(|c| c.is_ascii_hexdigit() || c == '.'));
    }

    #[test]
    fn failure_class_as_str_is_filesystem_safe() {
        let classes = [
            FailureClass::Auth,
            FailureClass::Budget,
            FailureClass::Storage,
            FailureClass::Arithmetic,
            FailureClass::Context,
            FailureClass::Object,
            FailureClass::Crypto,
            FailureClass::Events,
            FailureClass::Unknown,
        ];

        for class in classes {
            let s = class.as_str();
            // No path separators
            assert!(!s.contains('/'));
            assert!(!s.contains('\\'));
            assert!(!s.contains('\0'));
            // No special shell characters
            assert!(!s.contains(';'));
            assert!(!s.contains('&'));
            assert!(!s.contains('|'));
            assert!(!s.contains('`'));
            // Only alphanumeric and dash
            assert!(s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        }
    }

    // ── T-2: Memory Exhaustion Prevention ─────────────────────────────────────

    #[test]
    fn seed_schema_rejects_oversized_payload() {
        let schema = SeedSchema::default(); // 1-64 bytes
        let oversized = CaseSeed {
            id: 1,
            payload: vec![0; 1000],
        };

        let result = schema.validate(&oversized);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, SeedValidationError::PayloadTooLarge { .. })));
    }

    #[test]
    fn seed_schema_rejects_empty_payload() {
        let schema = SeedSchema::default();
        let empty = CaseSeed {
            id: 1,
            payload: vec![],
        };

        let result = schema.validate(&empty);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, SeedValidationError::PayloadTooSmall { .. })));
    }

    #[test]
    fn seed_schema_accepts_valid_payload() {
        let schema = SeedSchema::default();
        let valid = CaseSeed {
            id: 1,
            payload: vec![1, 2, 3, 4],
        };

        assert!(schema.validate(&valid).is_ok());
    }

    #[test]
    fn seed_schema_custom_bounds() {
        let schema = SeedSchema::new(10, 20, 0, u64::MAX);
        
        let too_small = CaseSeed { id: 1, payload: vec![1; 5] };
        let too_large = CaseSeed { id: 1, payload: vec![1; 25] };
        let just_right = CaseSeed { id: 1, payload: vec![1; 15] };

        assert!(schema.validate(&too_small).is_err());
        assert!(schema.validate(&too_large).is_err());
        assert!(schema.validate(&just_right).is_ok());
    }

    // ── T-3: Null Byte Handling ───────────────────────────────────────────────

    #[test]
    fn payload_with_null_byte_is_classified() {
        let seed = CaseSeed {
            id: 1,
            payload: b"valid\0malicious".to_vec(),
        };

        let sig = classify(&seed);
        // Should still classify, but integrators must be aware of null byte risk
        assert!(!sig.category.is_empty());
        assert_eq!(sig.signature_hash, compute_signature_hash(&sig.category, &seed.payload));
    }

    #[test]
    fn null_byte_affects_signature_hash() {
        let with_null = compute_signature_hash("runtime-failure", b"test\0data");
        let without_null = compute_signature_hash("runtime-failure", b"testdata");
        
        // Null byte should affect hash (not truncated)
        assert_ne!(with_null, without_null);
    }

    // ── T-4: Schema Version Validation ────────────────────────────────────────

    #[test]
    fn unsupported_schema_version_rejected() {
        let doc = CaseBundleDocument {
            schema: 999,
            seed: CaseSeed { id: 1, payload: vec![1] },
            signature: CrashSignature {
                category: "runtime-failure".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let bytes = serde_json::to_vec(&doc).unwrap();
        let result = load_case_bundle_json(&bytes);
        
        assert!(result.is_err());
        match result.unwrap_err() {
            BundlePersistError::UnsupportedSchema { found } => assert_eq!(found, 999),
            _ => panic!("expected UnsupportedSchema error"),
        }
    }

    #[test]
    fn supported_schema_versions_accepted() {
        for &schema_version in SUPPORTED_BUNDLE_SCHEMAS {
            let doc = CaseBundleDocument {
                schema: schema_version,
                seed: CaseSeed { id: 1, payload: vec![1, 2, 3] },
                signature: CrashSignature {
                    category: "runtime-failure".to_string(),
                    digest: 123,
                    signature_hash: 456,
                },
                environment: None,
                failure_payload: vec![],
                rpc_envelope: None,
            };

            let bytes = serde_json::to_vec(&doc).unwrap();
            let result = load_case_bundle_json(&bytes);
            assert!(result.is_ok(), "schema version {} should be supported", schema_version);
        }
    }

    // ── T-5: RPC Credential Redaction ─────────────────────────────────────────

    #[test]
    fn rpc_auth_parameter_is_redacted() {
        let request = RpcRequestEnvelope::new(
            "simulateTransaction",
            serde_json::json!({
                "transaction": "test_tx",
                "auth": "secret_token_12345"
            }),
        );

        assert_eq!(request.params["auth"], "[REDACTED]");
        assert_eq!(request.params["transaction"], "test_tx");
    }

    #[test]
    fn rpc_envelope_roundtrip_preserves_redaction() {
        let request = RpcRequestEnvelope::new(
            "test",
            serde_json::json!({
                "auth": "should_be_redacted",
                "data": "should_be_visible"
            }),
        );
        let response = RpcResponseEnvelope::success(serde_json::json!({"result": "ok"}));
        let envelope = RpcEnvelopeCapture::new_with_timestamp(request, response, "2024-01-01T00:00:00Z");

        let bundle = to_bundle_with_rpc_envelope(CaseSeed { id: 1, payload: vec![1] }, envelope);
        let bytes = save_case_bundle_json(&bundle).unwrap();
        let loaded = load_case_bundle_json(&bytes).unwrap();

        let loaded_envelope = loaded.rpc_envelope.unwrap();
        assert_eq!(loaded_envelope.request.params["auth"], "[REDACTED]");
        assert_eq!(loaded_envelope.request.params["data"], "should_be_visible");
    }

    // ── T-6: Secret Sanitization ──────────────────────────────────────────────

    #[test]
    fn sanitize_removes_secret_patterns() {
        let payload = b"sk_live_abc123def456 and api_key_xyz789".to_vec();
        let sanitized = sanitize_payload_fragments(&payload);
        
        // Should not contain original secrets
        assert!(!String::from_utf8_lossy(&sanitized).contains("sk_live_abc123def456"));
        assert!(!String::from_utf8_lossy(&sanitized).contains("api_key_xyz789"));
    }

    #[test]
    fn sanitized_bundle_export_scrubs_secrets() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: b"password=secret123".to_vec(),
        });
        bundle.failure_payload = b"Error: sk_test_token_abc".to_vec();

        let bytes = save_sanitized_case_bundle_json(&bundle).unwrap();
        let json_str = String::from_utf8(bytes).unwrap();

        // Should not contain literal secrets
        assert!(!json_str.contains("secret123"));
        assert!(!json_str.contains("sk_test_token_abc"));
    }

    // ── T-9: Rust Fixture Code Injection Prevention ──────────────────────────

    #[test]
    fn rust_fixture_rejects_invalid_test_name() {
        let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });

        let invalid_names = [
            "test name with spaces",
            "test-with-dashes",
            "123_starts_with_number",
            "",
            "test;rm -rf /",
            "test`whoami`",
            "test$(whoami)",
        ];

        for name in invalid_names {
            let result = export_rust_regression_fixture(&bundle, name);
            assert!(result.is_err(), "should reject invalid name: {}", name);
        }
    }

    #[test]
    fn rust_fixture_accepts_valid_test_name() {
        let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });

        let valid_names = [
            "test_crash",
            "seed_42_runtime",
            "_private_test",
            "TestCamelCase",
            "test123",
        ];

        for name in valid_names {
            let result = export_rust_regression_fixture(&bundle, name);
            assert!(result.is_ok(), "should accept valid name: {}", name);
        }
    }

    #[test]
    fn rust_fixture_payload_is_hex_encoded() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0x01, 0x02, 0x03, 0xFF],
        });

        let fixture = export_rust_regression_fixture(&bundle, "test_hex").unwrap();

        // Payload should be hex literals, not raw bytes
        assert!(fixture.contains("0x"));
        assert!(!fixture.contains("\\x")); // Not escape sequences
        
        // Should not contain code injection attempts
        assert!(!fixture.contains("};"));
        assert!(!fixture.contains("std::process::Command"));
    }

    // ── T-10: Storage Exhaustion ──────────────────────────────────────────────

    #[test]
    fn retention_policy_limits_failure_bundles() {
        let policy = RetentionPolicy::new(5, 3);
        
        let bundles: Vec<CaseBundle> = (0..10)
            .map(|i| to_bundle(CaseSeed { id: i, payload: vec![i as u8] }))
            .collect();

        let retained = policy.retain_failure_bundles(&bundles);
        
        // Should keep only 5 most recent (highest seed IDs)
        assert_eq!(retained.len(), 5);
        assert_eq!(retained[0].seed.id, 9);
        assert_eq!(retained[4].seed.id, 5);
    }

    #[test]
    fn retention_policy_limits_checkpoints() {
        let policy = RetentionPolicy::new(10, 2);
        
        let checkpoints: Vec<RunCheckpoint> = (0..5)
            .map(|i| RunCheckpoint::new(i * 100, "campaign_1"))
            .collect();

        let retained = policy.retain_checkpoints(&checkpoints);
        
        // Should keep only 2 most advanced
        assert_eq!(retained.len(), 2);
        assert_eq!(retained[0].next_seed_index, 400);
        assert_eq!(retained[1].next_seed_index, 300);
    }

    // ── Additional Security Tests ─────────────────────────────────────────────

    #[test]
    fn signature_hash_is_deterministic_across_runs() {
        let hash1 = compute_signature_hash("runtime-failure", b"test_payload");
        let hash2 = compute_signature_hash("runtime-failure", b"test_payload");
        let hash3 = compute_signature_hash("runtime-failure", b"test_payload");
        
        assert_eq!(hash1, hash2);
        assert_eq!(hash2, hash3);
    }

    #[test]
    fn different_payloads_produce_different_hashes() {
        let hash1 = compute_signature_hash("runtime-failure", b"payload1");
        let hash2 = compute_signature_hash("runtime-failure", b"payload2");
        
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn corpus_export_is_deterministic() {
        let seeds = vec![
            CaseSeed { id: 3, payload: vec![3] },
            CaseSeed { id: 1, payload: vec![1] },
            CaseSeed { id: 2, payload: vec![2] },
        ];

        let export1 = export_corpus_json(&seeds).unwrap();
        let export2 = export_corpus_json(&seeds).unwrap();
        
        assert_eq!(export1, export2);
    }

    #[test]
    fn bundle_with_large_failure_payload_serializes() {
        let mut bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });
        bundle.failure_payload = vec![0xFF; 10_000]; // 10KB

        let result = save_case_bundle_json(&bundle);
        assert!(result.is_ok());
        
        let bytes = result.unwrap();
        let loaded = load_case_bundle_json(&bytes).unwrap();
        assert_eq!(loaded.failure_payload.len(), 10_000);
    }

    #[test]
    fn malformed_json_rejected_gracefully() {
        let malformed_inputs = [
            b"not json at all",
            b"{",
            b"{}",
            b"{\"schema\": \"not a number\"}",
            b"{\"schema\": 1}",  // Missing required fields
        ];

        for input in malformed_inputs {
            let result = load_case_bundle_json(input);
            assert!(result.is_err(), "should reject malformed JSON");
        }
    }

    #[test]
    fn environment_fingerprint_captures_host_info() {
        let fp = EnvironmentFingerprint::capture();
        
        assert!(!fp.os.is_empty());
        assert!(!fp.arch.is_empty());
        assert!(!fp.family.is_empty());
        assert!(!fp.crashlab_version.is_empty());
    }

    #[test]
    fn replay_environment_mismatch_detected() {
        let mut bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });
        bundle.environment = Some(EnvironmentFingerprint::new(
            "fictional-os",
            "fictional-arch",
            "fictional-family",
            "0.0.0",
        ));

        let current = EnvironmentFingerprint::capture();
        let report = bundle.replay_environment_report(&current);
        
        assert!(report.material_mismatch);
        assert!(!report.warnings.is_empty());
    }

    #[test]
    fn worker_partition_is_deterministic() {
        let partition = WorkerPartition::new(4, 0).unwrap();
        
        let seed1 = CaseSeed { id: 100, payload: vec![1] };
        let seed2 = CaseSeed { id: 100, payload: vec![1] };
        
        assert_eq!(
            partition.owns_seed(&seed1),
            partition.owns_seed(&seed2)
        );
    }

    #[test]
    fn worker_partitions_are_disjoint() {
        let total_workers = 4;
        let partitions: Vec<WorkerPartition> = (0..total_workers)
            .map(|i| WorkerPartition::new(total_workers, i).unwrap())
            .collect();

        let test_seed = CaseSeed { id: 42, payload: vec![1, 2, 3] };
        
        let owners: Vec<bool> = partitions.iter()
            .map(|p| p.owns_seed(&test_seed))
            .collect();

        // Exactly one worker should own this seed
        assert_eq!(owners.iter().filter(|&&x| x).count(), 1);
    }
}
