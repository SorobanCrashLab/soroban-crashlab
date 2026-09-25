pub mod auth_matrix;
pub mod cors;
pub mod health;
pub mod prng;
pub mod reproducer;
pub mod retry;
pub mod signature_hash;
pub mod taxonomy;
pub mod regression_group;
pub mod fixture;
pub mod fixture_classifier;
pub mod suite_runner;
pub mod runner;

pub use runner::{ContractRunner, RunnerError, RunnerCreationError, create_runner, MockRunner};

#[cfg(feature = "host-runner")]
pub mod host_runner;

#[cfg(feature = "rpc-runner")]
pub mod rpc_runner;

#[cfg(not(feature = "rpc-runner"))]
mod rpc_runner_stub {
    //! Stub module when rpc-runner feature is not enabled.
    use crate::{CaseSeed, CrashSignature};
    use crate::runner::RunnerError;

    pub struct RpcContractRunner;

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum RpcConfigError {
        FeatureNotEnabled,
    }

    impl std::fmt::Display for RpcConfigError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "rpc-runner feature not enabled")
        }
    }

    impl std::error::Error for RpcConfigError {}

    impl RpcContractRunner {
        pub fn new(_rpc_url: impl Into<String>) -> Result<Self, RpcConfigError> {
            Err(RpcConfigError::FeatureNotEnabled)
        }

        pub fn with_contract(
            _rpc_url: impl Into<String>,
            _contract_id: impl Into<String>,
        ) -> Result<Self, RpcConfigError> {
            Err(RpcConfigError::FeatureNotEnabled)
        }

        pub fn rpc_url(&self) -> &str {
            ""
        }

        pub fn contract_id(&self) -> Option<&str> {
            None
        }
    }

    impl crate::runner::ContractRunner for RpcContractRunner {
        fn run_seed(&mut self, _seed: &CaseSeed) -> Result<CrashSignature, RunnerError> {
            Err(RunnerError::Misconfigured {
                message: "rpc-runner feature not enabled".to_string(),
            })
        }
    }
}

pub use auth_matrix::{
    AuthMode, MatrixReport, ModeResult, collect_mismatched, format_mismatch_summary, run_matrix,
    run_matrix_for_seeds,
};
pub use cors::{
    evaluate_cors, CorsConfig, CorsError, CorsEvaluation, HttpMethod, OriginAllowlist,
    OriginPattern,
};
pub use health::{
    FailureMetrics, HealthMonitor, HealthStatus, HealthSummary, QueueMetrics, ThroughputMetrics,
};
pub use prng::{PrngMutator, RandomizeMutator, SeededPrng};
pub use reproducer::{
    FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pack, shrink_bundle_payload,
    shrink_seed_preserving_signature,
};
pub use retry::{RetryConfig, SimulationError, execute_with_retry};
pub use signature_hash::{SignatureHasher, hash_category_payload};
pub use taxonomy::{
    FailureClass, classify_failure, group_by_class, stable_failure_class_for_bundle,
};
pub use taxonomy::crash_signature_from_seed;
pub use regression_group::RegressionGroup;
pub use fixture::RegressionFixture;
pub use fixture_classifier::{classify_fixture, classify_and_wrap_fixture};
pub use suite_runner::{GroupSummary, GroupStats, SuiteRunnerConfig};

#[cfg(feature = "host-runner")]
pub use host_runner::HostContractRunner;

#[cfg(feature = "rpc-runner")]
pub use rpc_runner::{RpcContractRunner, RpcConfigError};

#[cfg(not(feature = "rpc-runner"))]
pub use rpc_runner_stub::{RpcContractRunner, RpcConfigError};

pub mod seed_validator;
pub use seed_validator::{SeedSchema, SeedValidationError, Validate};

pub mod havoc;
pub use havoc::{HavocConfig, HavocMutator, HavocOp, apply_havoc_mutation, derive_seed_state};

pub mod scheduler;
pub use scheduler::{Mutator, MutatorRegistry, SchedulerError, WeightedScheduler};

pub mod campaign_presets;
pub use campaign_presets::{CampaignParameters, CampaignPreset, ParseCampaignPresetError};
pub mod replay;
pub use replay::{
    ReplayError, ReplayResult, replay_mismatch_message, replay_seed_bundle,
    replay_seed_bundle_json, replay_seed_bundle_path, replay_success_message,
};

pub mod env_fingerprint;
pub use env_fingerprint::{
    EnvironmentFingerprint, ReplayEnvironmentReport, check_bundle_replay_environment,
    check_replay_environment,
};
pub mod boundary;
pub use boundary::{BoundaryMutator, generate_boundary_vectors};

pub mod enum_flip;
pub use enum_flip::{EnumVariantFlipMutator, is_invalid_enum_tag_payload};

pub mod decimal_precision;
pub use decimal_precision::{
    DecimalBoundaryCase, DecimalPrecisionMutator, decimal_boundary_cases,
    generate_decimal_precision_vectors,
};

pub mod bundle_persist;
pub use bundle_persist::{
    BundlePersistError, CASE_BUNDLE_SCHEMA_VERSION, CaseBundleDocument, SUPPORTED_BUNDLE_SCHEMAS,
    load_case_bundle_json, read_case_bundle_json, save_case_bundle_json, write_case_bundle_json,
};

pub mod run_metadata;
pub use run_metadata::{RunMetadata, MetadataPersistError, RUN_METADATA_SCHEMA_VERSION, SUPPORTED_METADATA_SCHEMAS};
pub mod artifact_compress;
pub use artifact_compress::{compress_artifact, decompress_artifact};

pub mod artifact_storage;
pub use artifact_storage::{
    ArtifactMetadata, ArtifactStore, LocalArtifactStore, StorageConfig, StorageError,
};

pub mod fixture_compat;
pub use fixture_compat::{
    CompatReport, CompatWarning, check_bundle_fixtures, check_bundle_signature_hashes,
    check_manifest_engine_schema, check_seed_fixtures, check_seed_sanitization,
};

pub mod fixture_manifest;
pub use fixture_manifest::{
    FIXTURE_MANIFEST_SCHEMA_VERSION, FixtureManifest, FixtureMetadata, ManifestError,
};

pub mod fixture_linter;
pub use fixture_linter::{
    FixtureLinter, LintConfig, LintIssue, LintLevel, LintReport, LinterError,
};

pub mod signature_comparison;
pub use signature_comparison::{
    ComparisonError, ComparisonMetrics, SignatureComparisonResult, SignatureInfo,
    SignatureSnapshot, compare_signatures,
};

pub mod fixture_sanitize;
pub use fixture_sanitize::{
    export_sanitized_scenario_json, export_sanitized_suite_json,
    sanitize_and_validate_bundle, sanitize_bundle_document_for_sharing,
    sanitize_bundle_for_sharing, sanitize_bundle_with_context, sanitize_payload_fragments,
    sanitize_payload_with_context, sanitize_seed_for_sharing, sanitize_seed_with_context,
    sanitized_failure_scenario, save_sanitized_case_bundle_json,
    RedactionStrategy, SanitizationContext, SanitizationError, SanitizationReport,
    SanitizationRule,
};

pub mod checkpoint;
pub use checkpoint::{
    CheckpointError, RUN_CHECKPOINT_SCHEMA_VERSION, RunCheckpoint, load_run_checkpoint_json,
    save_run_checkpoint_json,
};

pub mod corpus;
pub use corpus::{
    CORPUS_ARCHIVE_SCHEMA_VERSION, CorpusArchive, CorpusError, corpus_archive_from_seeds,
    export_corpus_json, import_corpus_json,
};

pub mod corpus_import;
pub use corpus_import::{
    CorpusImportError, CorpusImportResult, import_seeds, import_seeds_with_schema,
};

pub mod retention;
pub use retention::{RetentionPolicy, RetentionRecord};

pub mod scenario_export;
pub use scenario_export::{
    FailureScenario, derive_test_name, export_crash_report_markdown, export_failing_seed_json,
    export_rust_regression_fixture, export_scenario_json, export_suite_json,
    write_rust_regression_snippet,
};

pub mod regression_suite;
pub use regression_suite::{
    RegressionCaseResult, RegressionSuiteSummary, load_regression_suite_json, run_regression_suite,
    run_regression_suite_from_json,
};

pub mod regression_grouping;
pub use regression_grouping::{
    RegressionGroupKey, export_rust_regression_suite, group_bundles_by_regression_group,
    regression_group_key, regression_group_keys_sorted, regression_group_module_ident,
};

pub mod simulation;
pub use simulation::{
    RunMetadataError, SUPPORTED_RUN_METADATA_SCHEMAS,
    SimulationTimeoutConfig, load_run_metadata_json, run_simulation_with_timeout,
    save_run_metadata_json, timeout_crash_signature, panic_crash_signature,
    MAX_CONCURRENT_SIMULATION_THREADS, active_simulation_thread_count,
};

pub mod container_stress;
pub use container_stress::{
    ContainerStressConfig, ContainerStressMutator, generate_container_stress_grid,
};

pub mod crash_index;
pub use crash_index::{CrashGroup, CrashGroupRecord, CrashIndex, CrashIndexSummary};

pub mod mutation_budget;
pub use mutation_budget::{BudgetReport, MutationBudget};

pub mod seed_novelty;
pub use seed_novelty::{
    DiscoveryBenchmark, NoveltyPrioritizer, SeedNoveltyCandidate, benchmark_novelty_discovery,
};
pub mod stale_detector;
pub use stale_detector::{StaleDetectorConfig, StaleRunDetector, StaleStatus};

pub mod worker_partition;
pub use worker_partition::{WorkerPartition, WorkerPartitionError, worker_for_seed};

pub mod health_snapshot;
pub use health_snapshot::{
    append_health_snapshot, classify_failure_message, health_snapshot_path, read_health_snapshots,
    read_latest_health_snapshot, terminal_label, BudgetSnapshot, CampaignHealth, HealthSnapshot,
    HealthSnapshotError, DEFAULT_SNAPSHOT_INTERVAL_SEEDS, HEALTH_SNAPSHOT_FILE,
    HEALTH_SNAPSHOT_SCHEMA_VERSION, SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS,
};

pub mod run_control;
pub use run_control::{
    cancel_marker_path, cancel_requested, clear_cancel_request, default_state_dir, drive_run,
    drive_run_from_checkpoint, drive_run_from_checkpoint_with_health, drive_run_partitioned,
    drive_run_partitioned_from_checkpoint, drive_run_partitioned_from_checkpoint_with_health,
    drive_run_partitioned_with_health, drive_run_with_health, request_cancel_run, CancelSignal,
    IgnoreProgress, RunId, RunProgress, RunResumeError, RunSummary, RunTerminalState,
};

pub mod rpc_envelope;
pub use rpc_envelope::{RpcEnvelopeCapture, RpcRequestEnvelope, RpcResponseEnvelope};

pub mod stellar_address;

// Re-enable threat model tests (compile-only pass). Obsolete cases can be
// ignored or updated as follow-ups (see ROADMAP-004).
#[cfg(test)]
mod threat_model_tests;
pub use stellar_address::{
    AddressMutatorConfig, AddressType, StellarAddressMutator, generate_address_vectors,
};

/// Default mutator for the core fuzzer loop.
///
/// Implements a havoc-style mutation strategy with weighted operations
/// (byte flips, block copy, block insert, block delete, chunk repeat, XDR tag flips)
/// and configurable length-aware bounds.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DefaultMutator {
    pub config: HavocConfig,
}

impl DefaultMutator {
    pub fn new(config: HavocConfig) -> Self {
        Self { config }
    }
}

impl Mutator for DefaultMutator {
    fn name(&self) -> &'static str {
        "havoc"
    }

    fn mutate(&self, seed: &CaseSeed, rng_state: &mut u64) -> CaseSeed {
        let mut payload = seed.payload.clone();
        apply_havoc_mutation(&mut payload, &self.config, rng_state);
        CaseSeed {
            id: seed.id,
            payload,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CaseSeed {
    pub id: u64,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CrashSignature {
    pub category: String,
    pub digest: u64,
    /// Stable hash derived solely from `category` and payload bytes.
    ///
    /// Two failures are considered equivalent when their `signature_hash` values
    /// are equal, regardless of which seed produced them.
    pub signature_hash: u64,
}

/// Computes a stable FNV-1a 64-bit hash from `category` and `payload`.
///
/// The hash is deterministic and independent of any seed ID, so equivalent
/// failures always produce the same value.
pub fn compute_signature_hash(category: &str, payload: &[u8]) -> u64 {
    // Delegate to the centralized signature hashing implementation so the
    // hashing format remains stable and consistent across callers.
    signature_hash::hash_category_payload(category, payload)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseBundle {
    pub seed: CaseSeed,
    pub signature: CrashSignature,
    /// Host environment captured when the bundle was produced, if enabled.
    pub environment: Option<EnvironmentFingerprint>,
    /// Raw failure output (stderr, host error bytes, trace snippet, etc.).
    pub failure_payload: Vec<u8>,
    /// Captured RPC request/response envelopes for reproducibility auditing.
    pub rpc_envelope: Option<RpcEnvelopeCapture>,
}

impl CaseBundle {
    /// Compares the stored fingerprint (if any) with `current` for replay safety.
    pub fn replay_environment_report(
        &self,
        current: &EnvironmentFingerprint,
    ) -> ReplayEnvironmentReport {
        check_replay_environment(self.environment.as_ref(), current)
    }
}

/// Mutates a [`CaseSeed`] using the havoc mutation strategy.
///
/// Deterministically mutates `seed` based on its initial state (`id` and `payload`).
/// The mutation is guaranteed never to be self-inverse over two steps.
pub fn mutate_seed(seed: &CaseSeed) -> CaseSeed {
    let mut rng_state = derive_seed_state(seed);
    let mut payload = seed.payload.clone();
    apply_havoc_mutation(&mut payload, &HavocConfig::default(), &mut rng_state);
    CaseSeed {
        id: seed.id,
        payload,
    }
}

pub fn randomize_seed(seed: &CaseSeed) -> CaseSeed {
    let mut rng = SeededPrng::new(seed.id);
    let len = seed.payload.len().max(1);
    CaseSeed {
        id: seed.id,
        payload: rng.mutation_stream(len),
    }
}

pub fn classify(seed: &CaseSeed) -> CrashSignature {
    // Delegate signature construction to the taxonomy helper which produces
    // category labels consistent with `classify_failure` and a centralized
    // signature hashing strategy.
    taxonomy::crash_signature_from_seed(seed)
}

pub fn to_bundle(seed: CaseSeed) -> CaseBundle {
    let mutated = mutate_seed(&seed);
    let signature = classify(&mutated);
    CaseBundle {
        seed: mutated,
        signature,
        environment: None,
        failure_payload: Vec::new(),
        rpc_envelope: None,
    }
}

/// Like [`to_bundle`], but attaches [`EnvironmentFingerprint::capture`] for replay checks.
pub fn to_bundle_with_environment(seed: CaseSeed) -> CaseBundle {
    let environment = Some(EnvironmentFingerprint::capture());
    let mutated = mutate_seed(&seed);
    let signature = classify(&mutated);
    CaseBundle {
        seed: mutated,
        signature,
        environment,
        failure_payload: Vec::new(),
        rpc_envelope: None,
    }
}

/// Like [`to_bundle`], but attaches an RPC envelope capture for reproducibility auditing.
pub fn to_bundle_with_rpc_envelope(seed: CaseSeed, envelope: RpcEnvelopeCapture) -> CaseBundle {
    let mutated = mutate_seed(&seed);
    let signature = classify(&mutated);
    CaseBundle {
        seed: mutated,
        signature,
        environment: None,
        failure_payload: Vec::new(),
        rpc_envelope: Some(envelope),
    }
}

pub fn signatures_match(expected: &CrashSignature, actual: &CrashSignature) -> bool {
    expected.category == actual.category
        && expected.digest == actual.digest
        && expected.signature_hash == actual.signature_hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_is_deterministic() {
        let seed = CaseSeed {
            id: 42,
            payload: vec![1, 2, 3, 4],
        };
        let a = mutate_seed(&seed);
        let b = mutate_seed(&seed);
        assert_eq!(a, b);
    }

    #[test]
    fn mutation_is_never_self_inverse_over_two_steps() {
        let test_payloads = vec![
            vec![],
            vec![42],
            vec![1, 2, 3, 4],
            vec![0xE0, 0x00, 0x01, 0x02],
            vec![0xAA; 32],
            (0..64u8).collect(),
        ];
        for (i, payload) in test_payloads.into_iter().enumerate() {
            let s0 = CaseSeed {
                id: (i as u64) + 100,
                payload,
            };
            let s1 = mutate_seed(&s0);
            assert_ne!(s1.payload, s0.payload, "single mutation should alter payload");
            let s2 = mutate_seed(&s1);
            assert_ne!(
                s2.payload, s0.payload,
                "mutation was self-inverse over two steps for seed id={}: s0={:?}, s1={:?}, s2={:?}",
                s0.id, s0.payload, s1.payload, s2.payload
            );
        }
    }

    #[test]
    fn default_mutator_deterministic_with_same_rng() {
        let mutator = DefaultMutator::default();
        let seed = CaseSeed {
            id: 99,
            payload: vec![1, 2, 3, 4, 5],
        };
        let mut rng1 = 12345u64;
        let mut rng2 = 12345u64;
        let a = mutator.mutate(&seed, &mut rng1);
        let b = mutator.mutate(&seed, &mut rng2);
        assert_eq!(a, b);
        assert_eq!(rng1, rng2);
    }

    #[test]
    fn classification_detects_empty_input() {
        let seed = CaseSeed {
            id: 7,
            payload: vec![],
        };
        let sig = classify(&seed);
        assert_eq!(sig.category, "empty-input");
    }

    #[test]
    fn classification_detects_invalid_enum_tag_distinct_from_runtime_failure() {
        let seed = CaseSeed {
            id: 11,
            payload: vec![0xE0, 0xFF, 0xAA],
        };
        let sig = classify(&seed);
        assert_eq!(sig.category, "invalid-enum-tag");
    }

    #[test]
    fn bundle_contains_signature() {
        let seed = CaseSeed {
            id: 9,
            payload: vec![9, 9, 9],
        };
        let bundle = to_bundle(seed);
        assert!(!bundle.signature.category.is_empty());
    }

    #[test]
    fn to_bundle_has_no_environment_by_default() {
        let bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });
        assert!(bundle.environment.is_none());
    }

    #[test]
    fn to_bundle_with_environment_captures_fingerprint() {
        let bundle = to_bundle_with_environment(CaseSeed {
            id: 1,
            payload: vec![1],
        });
        let fp = bundle.environment.as_ref().expect("fingerprint");
        assert_eq!(fp.os, std::env::consts::OS);
        assert_eq!(fp.arch, std::env::consts::ARCH);
    }

    #[test]
    fn replay_environment_report_clean_when_capture_matches_bundle() {
        let bundle = to_bundle_with_environment(CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        });
        let current = EnvironmentFingerprint::capture();
        let report = bundle.replay_environment_report(&current);
        assert!(!report.material_mismatch);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn replay_environment_report_warns_when_recorded_os_differs() {
        let mut bundle = to_bundle(CaseSeed {
            id: 1,
            payload: vec![1],
        });
        bundle.environment = Some(EnvironmentFingerprint::new(
            "fictional-os",
            std::env::consts::ARCH,
            std::env::consts::FAMILY,
            "0.0.0",
        ));
        let report = bundle.replay_environment_report(&EnvironmentFingerprint::capture());
        assert!(report.material_mismatch);
        assert!(report.warnings.iter().any(|w| w.contains("os")));
    }

    // ── signature_hash stability ──────────────────────────────────────────────

    #[test]
    fn equivalent_failures_produce_identical_signature_hash() {
        // Same payload, different seed IDs → same signature_hash.
        let seed_a = CaseSeed {
            id: 1,
            payload: vec![1, 2, 3],
        };
        let seed_b = CaseSeed {
            id: 99,
            payload: vec![1, 2, 3],
        };
        let sig_a = classify(&seed_a);
        let sig_b = classify(&seed_b);
        assert_eq!(sig_a.category, sig_b.category);
        assert_eq!(sig_a.signature_hash, sig_b.signature_hash);
    }

    #[test]
    fn signature_hash_differs_across_categories() {
        let empty = CaseSeed {
            id: 0,
            payload: vec![],
        };
        let normal = CaseSeed {
            id: 0,
            payload: vec![1],
        };
        let sig_empty = classify(&empty);
        let sig_normal = classify(&normal);
        assert_ne!(sig_empty.signature_hash, sig_normal.signature_hash);
    }

    #[test]
    fn signature_hash_is_deterministic() {
        let hash_a = compute_signature_hash("runtime-failure", &[10, 20, 30]);
        let hash_b = compute_signature_hash("runtime-failure", &[10, 20, 30]);
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn different_payloads_produce_different_signature_hash() {
        let hash_a = compute_signature_hash("runtime-failure", &[1, 2, 3]);
        let hash_b = compute_signature_hash("runtime-failure", &[3, 2, 1]);
        assert_ne!(hash_a, hash_b);
    }

    #[test]
    fn signatures_match_requires_category_digest_and_signature_hash() {
        let expected = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 11,
            signature_hash: 22,
        };
        let same = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 11,
            signature_hash: 22,
        };
        let different_digest = CrashSignature {
            category: "runtime-failure".to_string(),
            digest: 99,
            signature_hash: 22,
        };
        assert!(signatures_match(&expected, &same));
        assert!(!signatures_match(&expected, &different_digest));
    }
}
