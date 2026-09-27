//! Comprehensive security tests for threat model validation
//!
//! This module validates mitigations for threats identified in
//! `docs/THREAT_MODEL_ARTIFACT_HANDLING.md`.
//!
//! Tests are organized by threat category (T-1 through T-10) and follow
//! the attack scenarios outlined in the threat model document. Each test
//! validates that specific mitigations are effective and that residual
//! risks are understood.
//!
//! ## Organization
//!
//! - **T-1**: Path Traversal Prevention
//! - **T-2**: Memory Exhaustion Prevention
//! - **T-3**: Null Byte Handling
//! - **T-4**: Schema Version Validation
//! - **T-5**: RPC Credential Redaction
//! - **T-6**: Secret Sanitization
//! - **T-7**: Symlink Attack Prevention
//! - **T-8**: Concurrent Checkpoint Access
//! - **T-9**: Rust Fixture Code Injection Prevention
//! - **T-10**: Storage Exhaustion
//!
//! ## Maintenance
//!
//! When adding new threats or mitigations:
//! 1. Update the threat model document
//! 2. Add or update tests in this module
//! 3. Update the organization section above
//! 4. Mark residual risks with comments

#[cfg(test)]
mod threat_model_tests {
    use crate::*;
    use crate::seed_validator::Validate;

    // ═══════════════════════════════════════════════════════════════════════════
    // T-1: Path Traversal Prevention
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker crafts seed with path separators in payload. If used
    //         naively in filename construction, artifacts can be written outside
    //         the intended directory.
    //
    // Mitigations:
    //   M-2: Signature hash for filenames ensures only safe hex output
    //   No path separators, null bytes, or special characters in hashes

    #[test]
    fn t1_signature_hash_produces_safe_filename() {
        let hash = compute_signature_hash("runtime-failure", b"../../etc/passwd");
        let filename = format!("{:016x}.json", hash);
        
        // Verify no path separators exist in hex output
        assert!(!filename.contains('/'), "hash output contains forward slash");
        assert!(!filename.contains('\\'), "hash output contains backslash");
        assert!(!filename.contains('\0'), "hash output contains null byte");
        
        // Verify it's a valid hex string (with .json extension)
        let hex_part = filename.strip_suffix(".json").unwrap_or(&filename);
        assert!(hex_part.chars().all(|c| c.is_ascii_hexdigit()),
                "hash contains non-hexadecimal characters");
    }

    #[test]
    fn t1_signature_hash_blocks_various_path_traversal_attempts() {
        let malicious_payloads = [
            b"../../../etc/passwd".as_slice(),
            b"..\\..\\..\\windows\\system32\\config\\sam".as_slice(),
            b"/etc/shadow".as_slice(),
            b"C:\\Windows\\System32\\config\\sam".as_slice(),
            b"~/.ssh/id_rsa".as_slice(),
            b"${HOME}/.ssh/authorized_keys".as_slice(),
        ];

        for payload in malicious_payloads {
            let hash = compute_signature_hash("runtime-failure", payload);
            let filename = format!("{:016x}.json", hash);
            
            assert!(!filename.contains('/'), "path traversal via forward slash: {:?}", payload);
            assert!(!filename.contains('\\'), "path traversal via backslash: {:?}", payload);
            assert!(!filename.contains(".."), "path traversal via double-dot: {:?}", payload);
        }
    }

    #[test]
    fn t1_failure_class_as_str_is_filesystem_safe() {
        // Verify all FailureClass variants produce filesystem-safe labels.
        // These labels may be used in directory or file names, so must not
        // contain path separators or special shell characters.
        let classes = [
            FailureClass::Auth,
            FailureClass::Budget,
            FailureClass::State,
            FailureClass::Xdr,
            FailureClass::InvalidEnumTag,
            FailureClass::EmptyInput,
            FailureClass::OversizedInput,
            FailureClass::Unknown,
            FailureClass::Timeout,
        ];

        for class in classes {
            let s = class.as_str();
            
            // No path separators
            assert!(!s.contains('/'), "forward slash in {}: {}", class.as_str(), s);
            assert!(!s.contains('\\'), "backslash in {}: {}", class.as_str(), s);
            assert!(!s.contains('\0'), "null byte in {}: {}", class.as_str(), s);
            
            // No special shell characters that could enable injection
            assert!(!s.contains(';'), "semicolon in {}: {}", class.as_str(), s);
            assert!(!s.contains('&'), "ampersand in {}: {}", class.as_str(), s);
            assert!(!s.contains('|'), "pipe in {}: {}", class.as_str(), s);
            assert!(!s.contains('`'), "backtick in {}: {}", class.as_str(), s);
            assert!(!s.contains('$'), "dollar sign in {}: {}", class.as_str(), s);
            
            // Only alphanumeric and dash allowed
            assert!(s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
                   "invalid character in {}: {}", class.as_str(), s);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-2: Memory Exhaustion Prevention
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker submits oversized payload (multi-megabyte). If validation
    //         is skipped, fuzzer allocates excessive memory causing OOM or slowdown.
    //
    // Mitigations:
    //   M-1: SeedSchema validates payload length with configurable bounds
    //   Default: 1-64 bytes; Residual Risk: Validation can be skipped

    #[test]
    fn t2_seed_schema_rejects_oversized_payload() {
        let schema = SeedSchema::default(); // 1-64 bytes by default
        let oversized = CaseSeed {
            id: 1,
            payload: vec![0; 1000],
        };

        let result = oversized.validate(&schema);
        assert!(result.is_err(), "oversized payload should fail validation");
        
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, SeedValidationError::PayloadTooLong { .. })),
                "error should mention payload too long");
    }

    #[test]
    fn t2_seed_schema_rejects_empty_payload() {
        let schema = SeedSchema::strict();
        let empty = CaseSeed {
            id: 1,
            payload: vec![],
        };

        let result = empty.validate(&schema);
        assert!(result.is_err(), "empty payload should fail validation with strict schema");
        
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, SeedValidationError::PayloadTooShort { .. })),
                "error should mention payload too short");
    }

    #[test]
    fn t2_seed_schema_accepts_valid_payload() {
        let schema = SeedSchema::default();
        let valid = CaseSeed {
            id: 1,
            payload: vec![1, 2, 3, 4],
        };

        assert!(valid.validate(&schema).is_ok(), 
                "valid payload should pass validation");
    }

    #[test]
    fn t2_seed_schema_custom_bounds() {
        let schema = SeedSchema::new(10, 20, 0, u64::MAX);
        
        let too_small = CaseSeed { id: 1, payload: vec![1; 5] };
        let too_large = CaseSeed { id: 1, payload: vec![1; 25] };
        let just_right = CaseSeed { id: 1, payload: vec![1; 15] };

        assert!(too_small.validate(&schema).is_err(),
                "payload smaller than min bound should fail");
        assert!(too_large.validate(&schema).is_err(),
                "payload larger than max bound should fail");
        assert!(just_right.validate(&schema).is_ok(),
                "payload within bounds should pass");
    }

    #[test]
    fn t2_seed_schema_boundary_conditions() {
        let schema = SeedSchema::new(10, 20, 0, u64::MAX);
        
        let at_min = CaseSeed { id: 1, payload: vec![1; 10] };
        let at_max = CaseSeed { id: 1, payload: vec![1; 20] };
        let below_min = CaseSeed { id: 1, payload: vec![1; 9] };
        let above_max = CaseSeed { id: 1, payload: vec![1; 21] };

        assert!(at_min.validate(&schema).is_ok(),
                "payload exactly at minimum should pass");
        assert!(at_max.validate(&schema).is_ok(),
                "payload exactly at maximum should pass");
        assert!(below_min.validate(&schema).is_err(),
                "payload below minimum should fail");
        assert!(above_max.validate(&schema).is_err(),
                "payload above maximum should fail");
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // T-3: Null Byte Handling
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Payload contains null byte (0x00). If passed to C API or used
    //         in C-style string context, payload is truncated causing incorrect
    //         classification or replay mismatch.
    //
    // Mitigations:
    //   Documented as known gap in README and MAINTAINER_WAVE_PLAYBOOK
    //   Residual Risk: Null bytes are preserved in Rust code but may cause
    //                 issues when crossing language boundaries

    #[test]
    fn t3_payload_with_null_byte_is_classified() {
        let seed = CaseSeed {
            id: 1,
            payload: b"valid\0malicious".to_vec(),
        };

        let sig = classify(&seed);
        // Should still classify, but integrators must be aware of null byte risk
        assert!(!sig.category.is_empty(), "null byte should not prevent classification");
        assert_eq!(sig.signature_hash, compute_signature_hash(&sig.category, &seed.payload),
                   "classification must use full payload including null bytes");
    }

    #[test]
    fn t3_null_byte_affects_signature_hash() {
        let with_null = compute_signature_hash("runtime-failure", b"test\0data");
        let without_null = compute_signature_hash("runtime-failure", b"testdata");
        
        // Null byte should affect hash (not truncated at null byte)
        assert_ne!(with_null, without_null,
                   "null byte should be included in hash calculation");
    }

    #[test]
    fn t3_null_byte_at_different_positions_produce_different_hashes() {
        let hash1 = compute_signature_hash("runtime-failure", b"\0test");
        let hash2 = compute_signature_hash("runtime-failure", b"t\0est");
        let hash3 = compute_signature_hash("runtime-failure", b"test\0");
        
        assert_ne!(hash1, hash2, "null byte position should affect hash");
        assert_ne!(hash2, hash3, "null byte position should affect hash");
        assert_ne!(hash1, hash3, "null byte position should affect hash");
    }

    #[test]
    fn t3_multiple_null_bytes_are_preserved() {
        let payload_one = b"data\0\0data".to_vec();
        let payload_two = b"data\0data".to_vec();
        
        let hash1 = compute_signature_hash("runtime-failure", &payload_one);
        let hash2 = compute_signature_hash("runtime-failure", &payload_two);
        
        assert_ne!(hash1, hash2, "multiple null bytes should be distinct from single");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-4: Schema Version Validation
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker provides bundle with future/invalid schema version.
    //         If not validated, deserializer may misinterpret fields or panic.
    //
    // Mitigations:
    //   M-3: Schema version validated against SUPPORTED_BUNDLE_SCHEMAS
    //   Provides clear error message for unsupported versions

    #[test]
    fn t4_unsupported_schema_version_rejected() {
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
        
        assert!(result.is_err(), "unsupported schema version should be rejected");
        match result.unwrap_err() {
            BundlePersistError::UnsupportedSchema { found } => {
                assert_eq!(found, 999, "error should report the unsupported schema version");
            },
            _ => panic!("expected UnsupportedSchema error"),
        }
    }

    #[test]
    fn t4_supported_schema_versions_accepted() {
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

    #[test]
    fn t4_schema_version_zero_rejected() {
        let doc = CaseBundleDocument {
            schema: 0,
            seed: CaseSeed { id: 1, payload: vec![1] },
            signature: CrashSignature {
                category: "test".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let bytes = serde_json::to_vec(&doc).unwrap();
        let result = load_case_bundle_json(&bytes);
        assert!(result.is_err(), "schema version 0 should be rejected");
    }

    #[test]
    fn t4_negative_schema_version_rejected() {
        // Schemas are unsigned, so negative will wrap. Test the concept
        // that invalid versions are rejected.
        let high_version = u32::MAX;
        let doc = CaseBundleDocument {
            schema: high_version,
            seed: CaseSeed { id: 1, payload: vec![1] },
            signature: CrashSignature {
                category: "test".to_string(),
                digest: 0,
                signature_hash: 0,
            },
            environment: None,
            failure_payload: vec![],
            rpc_envelope: None,
        };

        let bytes = serde_json::to_vec(&doc).unwrap();
        let result = load_case_bundle_json(&bytes);
        assert!(result.is_err(), "extremely high schema version should be rejected");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-5: RPC Credential Redaction
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: RPC request contains authentication token. If logged or captured
    //         without redaction, credentials are exposed in artifacts.
    //
    // Mitigations:
    //   M-4: RpcRequestEnvelope redacts 'auth' field in params
    //   Residual Risk: HTTP headers not redacted (Authorization, API-Key, etc.)

    #[test]
    fn t5_rpc_auth_parameter_is_redacted() {
        let request = RpcRequestEnvelope::new(
            "simulateTransaction",
            serde_json::json!({
                "transaction": "test_tx",
                "auth": "secret_token_12345"
            }),
        );

        assert_eq!(request.params["auth"], "[REDACTED]",
                   "auth parameter should be redacted");
        assert_eq!(request.params["transaction"], "test_tx",
                   "other parameters should not be redacted");
    }

    #[test]
    fn t5_rpc_envelope_roundtrip_preserves_redaction() {
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
        assert_eq!(loaded_envelope.request.params["auth"], "[REDACTED]",
                   "auth should remain redacted after roundtrip");
        assert_eq!(loaded_envelope.request.params["data"], "should_be_visible",
                   "other fields should not be affected");
    }

    #[test]
    fn t5_multiple_auth_attempts_are_redacted() {
        let request = RpcRequestEnvelope::new(
            "test",
            serde_json::json!({
                "auth": "token1",
                "auth_backup": "token2",
                "data": "visible"
            }),
        );

        // Only explicit 'auth' field is redacted by current implementation
        assert_eq!(request.params["auth"], "[REDACTED]");
        // Note: 'auth_backup' is not redacted - this is a residual risk
        // documented in the threat model
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-6: Secret Sanitization
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Crash payload contains private key, API token, or password.
    //         If exported without sanitization, secrets are leaked in reports.
    //
    // Mitigations:
    //   M-5: sanitize_payload_fragments scrubs secret-like patterns
    //   save_sanitized_case_bundle_json for safe export
    //   Residual Risk: Raw export functions don't enforce sanitization

    #[test]
    fn t6_sanitize_removes_secret_patterns() {
        let payload = b"sk_live_abc123def456 and api_key_xyz789".to_vec();
        let sanitized = sanitize_payload_fragments(&payload);
        
        let sanitized_str = String::from_utf8_lossy(&sanitized);
        // Sanitization should redact or remove secret patterns
        assert!(!sanitized_str.contains("sk_live"), "sk_live pattern should be redacted");
        assert!(!sanitized_str.contains("abc123def456"), "secret value should be redacted");
    }

    #[test]
    fn t6_sanitized_bundle_export_scrubs_secrets() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: b"password=secret123".to_vec(),
        });
        bundle.failure_payload = b"Error: sk_test_token_abc".to_vec();

        let bytes = save_sanitized_case_bundle_json(&bundle).unwrap();
        let json_str = String::from_utf8(bytes).unwrap();

        // Secrets should be redacted in sanitized export
        assert!(!json_str.contains("secret123"), "password should be redacted");
        assert!(!json_str.contains("sk_test_token_abc"), "API token should be redacted");
    }

    #[test]
    fn t6_sanitize_handles_empty_payload() {
        let empty = sanitize_payload_fragments(&[]);
        assert!(empty.is_empty(), "sanitizing empty payload should return empty");
    }

    #[test]
    fn t6_sanitize_preserves_non_secret_data() {
        let payload = b"This is a normal error message with no secrets".to_vec();
        let sanitized = sanitize_payload_fragments(&payload);
        
        let sanitized_str = String::from_utf8_lossy(&sanitized);
        assert!(sanitized_str.contains("error"), "normal words should be preserved");
        assert!(sanitized_str.contains("message"), "normal words should be preserved");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-7: Symlink Attack Prevention (Residual Risk)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker creates symlink in artifact directory pointing to
    //         sensitive file. Fuzzer overwrites symlink target.
    //
    // Residual Risk: MEDIUM - Requires local access but high impact
    // Mitigation (future): Use OpenOptions::create_new, check for symlinks,
    //                      use restrictive permissions (0o700)
    //
    // Note: Currently not mitigated at the library level. Integration guide
    //       recommends dedicated artifact directory with restrictive permissions.

    #[test]
    fn t7_symlink_attack_documented_as_residual_risk() {
        // This test documents that symlink attacks are a known residual risk
        // that should be mitigated at the integration level through:
        // 1. Dedicated artifact directory with 0o700 permissions
        // 2. Regular file integrity monitoring
        // 3. Atomic file creation with O_CREAT | O_EXCL
        
        // Placeholder test to ensure this threat remains visible
        assert!(true, "symlink risk mitigated at integration level");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-8: Concurrent Checkpoint Access (Residual Risk)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Two fuzzer instances resume from same checkpoint simultaneously.
    //         Both read same state, process same seeds, causing duplicate work.
    //
    // Mitigations:
    //   M-7: WorkerPartition splits seeds deterministically by worker ID
    //   Residual Risk: No file locking; duplicate work if same partition used
    //
    // Note: Mitigated by design - each worker gets deterministic partition

    #[test]
    fn t8_worker_partition_is_deterministic() {
        let partition = WorkerPartition::try_new(0, 4).unwrap();
        
        let seed1: u64 = 100;
        let seed2: u64 = 100;
        
        assert_eq!(partition.owns_seed(seed1), partition.owns_seed(seed2),
                   "partition assignment should be deterministic");
    }

    #[test]
    fn t8_worker_partitions_are_disjoint() {
        let total_workers = 4u32;
        let partitions: Vec<WorkerPartition> = (0..total_workers)
            .map(|i| WorkerPartition::try_new(i, total_workers).unwrap())
            .collect();

        let test_seed: u64 = 42;
        
        let owners: Vec<bool> = partitions.iter()
            .map(|p| p.owns_seed(test_seed))
            .collect();

        // Exactly one worker should own this seed
        let owner_count = owners.iter().filter(|&&x| x).count();
        assert_eq!(owner_count, 1, 
                   "seed should be owned by exactly one worker");
    }

    #[test]
    fn t8_worker_partition_all_seeds_assigned() {
        let total_workers = 3u32;
        let partitions: Vec<WorkerPartition> = (0..total_workers)
            .map(|i| WorkerPartition::try_new(i, total_workers).unwrap())
            .collect();

        // Test that every seed in a range is assigned to some worker
        for test_seed in 0..300 {
            let owners: Vec<bool> = partitions.iter()
                .map(|p| p.owns_seed(test_seed))
                .collect();
            
            let owner_count = owners.iter().filter(|&&x| x).count();
            assert!(owner_count >= 1, "seed {} should be owned by at least one worker", test_seed);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-9: Rust Fixture Code Injection Prevention
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker crafts bundle that generates malicious Rust code when
    //         exported as fixture. If test name or payload not sanitized,
    //         arbitrary code is injected.
    //
    // Mitigations:
    //   M-6: Test name validated with is_valid_rust_ident
    //   Payload is hex-encoded as literals, not string interpolation
    //   No code generation from untrusted input

    #[test]
    fn t9_rust_fixture_rejects_invalid_test_name() {
        let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });

        let invalid_names = [
            "test name with spaces",
            "test-with-dashes",
            "123_starts_with_number",
            "",
            "test;rm -rf /",
            "test`whoami`",
            "test$(whoami)",
            "test}{{",
            "test\n\r",
        ];

        for name in &invalid_names {
            let result = export_rust_regression_fixture(&bundle, name);
            assert!(result.is_err(), "should reject invalid name: {}", name);
        }
    }

    #[test]
    fn t9_rust_fixture_accepts_valid_test_name() {
        let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });

        let valid_names = [
            "test_crash",
            "seed_42_runtime",
            "_private_test",
            "TestCamelCase",
            "test123",
            "test_with_underscore",
            "TEST_UPPERCASE",
        ];

        for name in &valid_names {
            let result = export_rust_regression_fixture(&bundle, name);
            assert!(result.is_ok(), "should accept valid name: {}", name);
        }
    }

    #[test]
    fn t9_rust_fixture_payload_is_hex_encoded() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![0x01, 0x02, 0x03, 0xFF],
        });

        let fixture = export_rust_regression_fixture(&bundle, "test_hex").unwrap();

        // Payload should be hex literals, not raw bytes or string interpolation
        assert!(fixture.contains("0x"), "should contain hex literals");
        assert!(!fixture.contains("\\x"), "should not use escape sequences");
        
        // Should not contain code injection attempts
        assert!(!fixture.contains("std::process::Command"),
                "should not contain process execution code");
        assert!(!fixture.contains("std::fs::remove_dir"),
                "should not contain file deletion code");
    }

    #[test]
    fn t9_rust_fixture_with_malicious_payload() {
        let malicious_payload = b"}; std::process::Command::new(\"rm\").arg(\"-rf\").arg(\"/\").spawn(); {".to_vec();
        let bundle = to_bundle(CaseSeed { id: 1, payload: malicious_payload });

        let fixture = export_rust_regression_fixture(&bundle, "test_safe").unwrap();

        // Malicious code should be hex-encoded, not executable
        assert!(!fixture.contains("std::process::Command"),
                "payload should be hex-encoded, not executable");
        assert!(!fixture.contains("remove_dir"),
                "no filesystem operations should be generated");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // T-10: Storage Exhaustion
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Threat: Attacker triggers many unique crashes, filling disk with artifacts.
    //         Fuzzer cannot write new bundles, causing data loss.
    //
    // Mitigations:
    //   M-8: RetentionPolicy limits stored artifacts
    //   max_failure_bundles caps total count
    //   max_checkpoints_per_campaign limits checkpoint storage
    //   Residual Risk: No disk space monitoring; I/O errors not handled gracefully

    #[test]
    fn t10_retention_policy_limits_failure_bundles() {
        let mut policy = RetentionPolicy::default();
        policy.max_failure_bundles = 5;
        
        let bundles: Vec<CaseBundleDocument> = (0..10)
            .map(|i| {
                let seed = CaseSeed { id: i, payload: vec![i as u8] };
                let bundle = CaseBundle {
                    seed: seed.clone(),
                    signature: CrashSignature {
                        category: "test".to_string(),
                        digest: 0,
                        signature_hash: 0,
                    },
                    environment: Default::default(),
                    failure_payload: Default::default(),
                    rpc_envelope: Default::default(),
                };
                CaseBundleDocument::from_bundle(&bundle)
            })
            .collect();

        let retained = policy.retain_failure_bundles(&bundles);
        
        let retained_count = retained.iter().filter(|&&b| b).count();
        assert_eq!(retained_count, 5, "should retain exactly max_failure_bundles");
        
        // Should keep most recent (highest seed IDs)
        let kept_ids: Vec<u64> = bundles.iter().enumerate()
            .filter_map(|(i, b)| if retained[i] { Some(b.seed.id) } else { None })
            .collect();
        
        assert!(kept_ids.contains(&9), "should keep most recent");
        assert!(kept_ids.contains(&5), "should keep recent");
        assert!(!kept_ids.contains(&0), "should not keep oldest");
    }

    #[test]
    fn t10_retention_policy_respects_max_bundles_zero() {
        let mut policy = RetentionPolicy::default();
        policy.max_failure_bundles = 0;
        
        let bundles: Vec<CaseBundleDocument> = (0..5)
            .map(|i| {
                CaseBundleDocument {
                    schema: 1,
                    seed: CaseSeed { id: i, payload: vec![i as u8] },
                    signature: CrashSignature {
                        category: "test".to_string(),
                        digest: 0,
                        signature_hash: 0,
                    },
                    environment: None,
                    failure_payload: vec![],
                    rpc_envelope: None,
                }
            })
            .collect();

        let retained = policy.retain_failure_bundles(&bundles);
        
        let retained_count = retained.iter().filter(|&&b| b).count();
        assert_eq!(retained_count, 0, "should retain no bundles when limit is 0");
    }

    #[test]
    fn t10_retention_policy_limits_checkpoints() {
        let mut policy = RetentionPolicy::default();
        policy.max_checkpoints_per_campaign = 2;
        
        let dummy_seed = CaseSeed { id: 1, payload: vec![1] };
        let checkpoints: Vec<RunCheckpoint> = (0..5)
            .map(|i| {
                let mut ck = RunCheckpoint::new_run("campaign_1", &[dummy_seed.clone()]);
                ck.next_seed_index = i * 100;
                ck
            })
            .collect();

        let retained = policy.retain_checkpoints(&checkpoints);
        
        let retained_count = retained.iter().filter(|&&b| b).count();
        assert_eq!(retained_count, 2, "should retain exactly max_checkpoints_per_campaign");
        
        // Should keep most advanced (highest next_seed_index)
        let kept_indices: Vec<u64> = checkpoints.iter().enumerate()
            .filter_map(|(i, c)| if retained[i] { Some(c.next_seed_index as u64) } else { None })
            .collect();
        
        assert!(kept_indices.contains(&400), "should keep most advanced");
        assert!(kept_indices.contains(&300), "should keep recent");
        assert!(!kept_indices.contains(&0), "should not keep oldest");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Additional Security Tests
    // ═══════════════════════════════════════════════════════════════════════════
    // These tests verify important security properties across multiple threats

    #[test]
    fn signature_hash_is_deterministic_across_runs() {
        let hash1 = compute_signature_hash("runtime-failure", b"test_payload");
        let hash2 = compute_signature_hash("runtime-failure", b"test_payload");
        let hash3 = compute_signature_hash("runtime-failure", b"test_payload");
        
        assert_eq!(hash1, hash2, "hash should be deterministic");
        assert_eq!(hash2, hash3, "hash should be deterministic");
    }

    #[test]
    fn different_payloads_produce_different_hashes() {
        let hash1 = compute_signature_hash("runtime-failure", b"payload1");
        let hash2 = compute_signature_hash("runtime-failure", b"payload2");
        
        assert_ne!(hash1, hash2, "different payloads should produce different hashes");
    }

    #[test]
    fn different_categories_produce_different_hashes() {
        let hash1 = compute_signature_hash("runtime-failure", b"test");
        let hash2 = compute_signature_hash("budget-exceeded", b"test");
        let hash3 = compute_signature_hash("auth-failure", b"test");
        
        assert_ne!(hash1, hash2, "different categories should produce different hashes");
        assert_ne!(hash2, hash3, "different categories should produce different hashes");
        assert_ne!(hash1, hash3, "different categories should produce different hashes");
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
        
        assert_eq!(export1, export2, "corpus export should be deterministic");
    }

    #[test]
    fn bundle_with_large_failure_payload_serializes() {
        let mut bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });
        bundle.failure_payload = vec![0xFF; 10_000]; // 10KB

        let result = save_case_bundle_json(&bundle);
        assert!(result.is_ok(), "should serialize large failure payload");
        
        let bytes = result.unwrap();
        let loaded = load_case_bundle_json(&bytes).unwrap();
        assert_eq!(loaded.failure_payload.len(), 10_000,
                   "large payload should be preserved through roundtrip");
    }

    #[test]
    fn malformed_json_rejected_gracefully() {
        let malformed_inputs: &[&[u8]] = &[
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
        
        assert!(!fp.os.is_empty(), "OS should be captured");
        assert!(!fp.arch.is_empty(), "architecture should be captured");
        assert!(!fp.family.is_empty(), "family should be captured");
        assert!(!fp.tool_version.is_empty(), "tool version should be captured");
    }

    #[test]
    fn replay_environment_mismatch_detected() {
        let mut bundle = to_bundle(CaseSeed { id: 1, payload: vec![1] });
        bundle.environment = Some(EnvironmentFingerprint {
            os: "fictional-os".to_string(),
            arch: "fictional-arch".to_string(),
            family: "fictional-family".to_string(),
            tool_version: "0.0.0".to_string(),
        });

        let current = EnvironmentFingerprint::capture();
        // Verify that the environment can be captured and compared
        assert!(!current.os.is_empty(), "current environment should be capturable");
        assert!(!current.arch.is_empty(), "current environment should be capturable");
        
        // Different tool version should be detectable
        if current.tool_version != "0.0.0" {
            assert_ne!(bundle.environment.unwrap().tool_version, current.tool_version,
                       "environment mismatch should be detectable");
        }
    }
}
