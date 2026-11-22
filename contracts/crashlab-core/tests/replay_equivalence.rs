//! Cross-platform replay equivalence matrix (#1799).
//!
//! The product promise is that replaying a persisted seed yields the **same
//! failure class and the same signature** on any host. Until now only one OS
//! with one toolchain ever checked that. This suite makes the promise a
//! byte-for-byte artifact:
//!
//! 1. a **fixed seed list** — hand-written coverage of every class
//!    `classify_failure` derives from a payload, plus seeds drawn from a fixed
//!    [`SeededPrng`] stream — is pushed through the engine's own mutation,
//!    classification and signature-hashing chain,
//! 2. every resulting bundle is replayed (in memory and across a JSON round
//!    trip) and must reproduce its stored class and signature,
//! 3. the whole transcript is folded into a canonical golden document and
//!    compared **byte for byte** with the committed file
//!    `tests/golden/replay_equivalence.json`.
//!
//! A platform that prints a float differently, iterates a hash map in a
//! different order, embeds a different path separator or reads time differently
//! therefore fails loudly with a line diff instead of drifting silently.
//!
//! The golden document contains no host-dependent field: it is identical on
//! Linux, macOS and Windows by construction, which is exactly what the CI
//! matrix in `.github/workflows/regression-suite.yml` asserts.
//!
//! ## Modes
//!
//! `CRASHLAB_REPLAY_GOLDEN_MODE` decides what a golden mismatch does:
//!
//! | Mode | Behaviour |
//! |---|---|
//! | `strict` (default) | Fail with the first differing line and the regenerate command. |
//! | `report` | Emit a `::warning::` annotation and pass — report-only CI legs. |
//! | `update` | Rewrite the golden file from the current engine output. |
//!
//! ```text
//! CRASHLAB_REPLAY_GOLDEN_MODE=update cargo test -p crashlab-core --test replay_equivalence
//! ```
//!
//! Report-only legs need `-- --nocapture` (the matrix job passes it), because
//! libtest discards the output of passing tests otherwise.

use crashlab_core::{
    CaseSeed, EnvironmentFingerprint, ReplayAxis, SeededPrng, classify, classify_failure,
    load_case_bundle_json, replay_mismatch_message, replay_seed_bundle, replay_success_message,
    save_case_bundle_json, to_bundle,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Layout version of the golden file; bump when a record field changes.
const GOLDEN_SCHEMA: u32 = 1;
/// Probe identifier, mirroring the `repro_probe/v1` convention (#1898).
const PROBE: &str = "replay_equivalence/v1";
/// Golden file, relative to `contracts/crashlab-core/`.
const GOLDEN_RELATIVE_PATH: &str = "tests/golden/replay_equivalence.json";

/// Marker byte that starts an enum-shaped payload (`enum_flip.rs`).
const ENUM_MARKER: u8 = 0xE0;
/// Payload that exceeds the 64-byte classification limit.
const OVERSIZED_PAYLOAD: [u8; 65] = [0xA0; 65];

/// Hand-written seeds covering every class `classify_failure` derives from a
/// payload: empty, oversized, invalid-enum-tag and both ends of each byte
/// discriminant bucket. (`timeout`, `internal-panic` and `unknown` are runner
/// outcomes, not payload outcomes, so no seed can produce them.)
const FIXED_SEEDS: &[(u64, &[u8])] = &[
    (1_001, &[]),                       // empty-input
    (1_002, &[0x00]),                   // xdr (bucket start)
    (1_003, &[0x1F, 0x7F]),             // xdr (bucket end)
    (1_004, &[0x20]),                   // state (bucket start)
    (1_005, &[0x5F, 0x01, 0x02, 0x03]), // state (bucket end)
    (1_006, &[0x60]),                   // budget (bucket start)
    (1_007, &[0x9F, 0x10, 0x20]),       // budget (bucket end)
    (1_008, &[0xA0]),                   // auth (bucket start)
    (1_009, &[0xFF, 0xFF]),             // auth (bucket end)
    (1_010, &[ENUM_MARKER, 0xFE]),      // invalid-enum-tag
    (1_011, &OVERSIZED_PAYLOAD),        // oversized-input
    (
        1_012,
        &[0x30, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77],
    ), // state, multi-byte payload
];

/// Seeds derived from a pinned PRNG stream. The constants are literals rather
/// than campaign preset defaults so a preset change cannot silently invalidate
/// the golden file; the `engine` field records which crate version produced it.
const GENERATED_SEED_COUNT: u64 = 16;
const GENERATED_PAYLOAD_LEN: usize = 12;
const GENERATED_BASE_SEED: u64 = 0xC7A5_1AB1_5EED_0001;

fn fixed_seeds() -> Vec<CaseSeed> {
    FIXED_SEEDS
        .iter()
        .map(|(id, payload)| CaseSeed {
            id: *id,
            payload: payload.to_vec(),
        })
        .collect()
}

fn generated_seeds() -> Vec<CaseSeed> {
    (0..GENERATED_SEED_COUNT)
        .map(|index| {
            let mut prng =
                SeededPrng::new(GENERATED_BASE_SEED ^ index.wrapping_mul(0x9E37_79B9_7F4A_7C15));
            CaseSeed {
                id: index,
                payload: prng.mutation_stream(GENERATED_PAYLOAD_LEN),
            }
        })
        .collect()
}

fn all_seeds() -> Vec<CaseSeed> {
    fixed_seeds().into_iter().chain(generated_seeds()).collect()
}

/// One seed's class + signature transcript, before and after engine mutation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct GoldenSeed {
    id: u64,
    /// Input payload bytes, hex-encoded.
    payload: String,
    /// Class of the input payload.
    class: String,
    category: String,
    digest: u64,
    signature_hash: u64,
    /// Payload after the engine's own mutation (`to_bundle`).
    bundle_payload: String,
    /// Class of the mutated payload — what a responder replays.
    bundle_class: String,
    bundle_category: String,
    bundle_digest: u64,
    bundle_signature_hash: u64,
}

/// The committed expectation: fixed seeds + fixed engine version -> signatures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct GoldenDocument {
    schema: u32,
    probe: String,
    /// `crashlab-core` version that produced this file. An engine bump changes
    /// it and therefore the bytes, forcing the golden review the issue asks for.
    engine: String,
    seeds: Vec<GoldenSeed>,
}

fn record_for(seed: &CaseSeed) -> GoldenSeed {
    let signature = classify(seed);
    let bundle = to_bundle(seed.clone());
    GoldenSeed {
        id: seed.id,
        payload: hex::encode(&seed.payload),
        class: classify_failure(seed).as_str().to_string(),
        category: signature.category,
        digest: signature.digest,
        signature_hash: signature.signature_hash,
        bundle_payload: hex::encode(&bundle.seed.payload),
        bundle_class: classify_failure(&bundle.seed).as_str().to_string(),
        bundle_category: bundle.signature.category,
        bundle_digest: bundle.signature.digest,
        bundle_signature_hash: bundle.signature.signature_hash,
    }
}

fn current_document() -> GoldenDocument {
    GoldenDocument {
        schema: GOLDEN_SCHEMA,
        probe: PROBE.to_string(),
        engine: env!("CARGO_PKG_VERSION").to_string(),
        seeds: all_seeds().iter().map(record_for).collect(),
    }
}

/// Canonical bytes: pretty JSON in struct field order, LF newline terminated.
/// Only strings and integers appear, so the rendering cannot vary by platform.
fn render(document: &GoldenDocument) -> String {
    let mut json = serde_json::to_string_pretty(document).expect("golden document serializes");
    json.push('\n');
    json
}

fn golden_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(GOLDEN_RELATIVE_PATH)
}

fn golden_mode() -> String {
    let mode = std::env::var("CRASHLAB_REPLAY_GOLDEN_MODE")
        .unwrap_or_else(|_| "strict".to_string());
    assert!(
        matches!(mode.as_str(), "strict" | "report" | "update"),
        "unknown CRASHLAB_REPLAY_GOLDEN_MODE {mode:?}: expected strict, report or update"
    );
    mode
}

fn field_value<'a>(lines: &[&'a str], field: &str) -> Option<&'a str> {
    let needle = format!("\"{field}\":");
    lines
        .iter()
        .find(|line| line.trim_start().starts_with(&needle))
        .map(|line| {
            line.split(&needle)
                .nth(1)
                .unwrap_or("")
                .trim()
                .trim_end_matches(',')
                .trim_matches('"')
        })
}

fn mismatch_details(mode: &str, stored: &[u8], actual: &str, path: &Path) -> String {
    let stored_text = String::from_utf8_lossy(stored);
    let stored_lines: Vec<&str> = stored_text.lines().collect();
    let actual_lines: Vec<&str> = actual.lines().collect();

    let mut details = format!(
        "cross-platform golden replay signatures differ on {} {} (mode={mode})\n",
        std::env::consts::OS,
        std::env::consts::ARCH,
    );

    match (
        field_value(&stored_lines, "engine"),
        field_value(&actual_lines, "engine"),
    ) {
        (Some(golden), Some(current)) if golden != current => details.push_str(&format!(
            "engine version changed (golden {golden}, current {current}): the mutation \
             stream or taxonomy moved on purpose — regenerate and review the golden file\n"
        )),
        _ => {}
    }

    let first_diff = stored_lines
        .iter()
        .zip(actual_lines.iter())
        .position(|(stored_line, actual_line)| stored_line != actual_line)
        .unwrap_or_else(|| stored_lines.len().min(actual_lines.len()));
    let stored_line = stored_lines.get(first_diff).copied().unwrap_or("<missing>");
    let actual_line = actual_lines.get(first_diff).copied().unwrap_or("<missing>");
    details.push_str(&format!(
        "first differing line {}:\n  golden: {stored_line}\n  actual: {actual_line}\n",
        first_diff + 1
    ));
    if stored_lines.len() != actual_lines.len() {
        details.push_str(&format!(
            "line counts differ: golden {}, actual {}\n",
            stored_lines.len(),
            actual_lines.len()
        ));
    }

    details.push_str(&format!(
        "golden file: {}\nregenerate (then review the diff) with:\n  \
         CRASHLAB_REPLAY_GOLDEN_MODE=update cargo test -p crashlab-core --test replay_equivalence\n",
        path.display()
    ));
    details
}

fn fail_or_warn(mode: &str, details: &str) {
    if mode == "strict" {
        panic!("{details}");
    }
    // Report-only legs (#1799: land the matrix before the toolchain pin lands).
    // The annotation must stay on one line; the details follow as plain log text.
    eprintln!(
        "::warning title=Replay golden drift::golden replay signatures differ on {}/{} — see the log below (report-only mode)",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    eprintln!("{details}");
}

// ── The suite ────────────────────────────────────────────────────────────────

/// The byte-for-byte golden comparison (#1799).
#[test]
fn golden_signatures_match_the_committed_file() {
    let mode = golden_mode();
    let actual = render(&current_document());
    let path = golden_path();

    if mode == "update" {
        let parent = path.parent().expect("golden path has a parent directory");
        std::fs::create_dir_all(parent).expect("create golden directory");
        std::fs::write(&path, actual.as_bytes()).expect("write golden file");
        eprintln!("wrote golden signatures to {}", path.display());
        return;
    }

    let stored = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(err) => {
            fail_or_warn(
                &mode,
                &format!(
                    "golden signature file missing ({}, {err}). Regenerate with:\n  \
                     CRASHLAB_REPLAY_GOLDEN_MODE=update cargo test -p crashlab-core --test replay_equivalence\n",
                    path.display()
                ),
            );
            return;
        }
    };

    if stored == actual.as_bytes() {
        eprintln!(
            "golden replay signatures match on {}/{} (mode={mode})",
            std::env::consts::OS,
            std::env::consts::ARCH
        );
        return;
    }

    fail_or_warn(&mode, &mismatch_details(&mode, &stored, &actual, &path));
}

/// Replay itself: every fixed seed reproduces the class and signature of the
/// bundle it produced, on this host.
#[test]
fn every_seed_replays_to_its_recorded_class_and_signature() {
    for seed in all_seeds() {
        let bundle = to_bundle(seed.clone());
        let result = replay_seed_bundle(&bundle);
        assert!(
            result.matches,
            "seed {} failed to replay: {}",
            seed.id,
            replay_mismatch_message(&result)
        );
        assert!(result.class_matches, "seed {} class drifted", seed.id);
        assert!(
            result.signature_matches,
            "seed {} signature drifted",
            seed.id
        );
    }
}

/// The persisted form — what an incident responder actually receives — replays
/// to the same class and signature after a save → load round trip.
#[test]
fn bundle_json_round_trip_preserves_replay_equivalence() {
    for seed in all_seeds() {
        let bundle = to_bundle(seed.clone());
        let bytes = save_case_bundle_json(&bundle).expect("serialize bundle");
        let reloaded = load_case_bundle_json(&bytes).expect("load bundle");
        assert_eq!(
            reloaded.signature, bundle.signature,
            "seed {} signature changed across the bundle round trip",
            seed.id
        );
        let result = replay_seed_bundle(&reloaded);
        assert!(
            result.matches,
            "seed {} failed to replay from JSON: {}",
            seed.id,
            replay_mismatch_message(&result)
        );
    }
}

/// The document must not depend on hash iteration order, wall-clock time,
/// path separators or any other host property.
#[test]
fn the_golden_document_is_stable_within_a_process() {
    let first = render(&current_document());
    let second = render(&current_document());
    assert_eq!(
        first, second,
        "the golden transcript must be a pure function of the fixed seed list"
    );
}

/// Guards the coverage of the fixed seed list itself: a reviewer who trims a
/// seed must notice that a class lost its only representative.
#[test]
fn the_fixed_seed_list_covers_every_payload_derivable_class() {
    let covered: BTreeSet<String> = current_document()
        .seeds
        .iter()
        .map(|record| record.class.clone())
        .collect();
    for class in [
        "auth",
        "budget",
        "empty-input",
        "invalid-enum-tag",
        "oversized-input",
        "state",
        "xdr",
    ] {
        assert!(
            covered.contains(class),
            "the fixed seed list no longer covers the {class} class; covered: {covered:?}"
        );
    }
}

/// Replay must name the axis on which the recording host and this host
/// legitimately differ, instead of passing or failing silently (#1799).
#[test]
fn replay_warns_with_the_differing_environment_axis() {
    // Documented, non-material difference: only the path separator differs.
    let mut bundle = to_bundle(CaseSeed {
        id: 4_242,
        payload: vec![0x20, 0x01, 0x02],
    });
    let mut recorded = EnvironmentFingerprint::capture();
    recorded.path_separator = "<foreign>".to_string();
    bundle.environment = Some(recorded);

    let result = replay_seed_bundle(&bundle);
    assert!(result.matches, "environment must not change the signature");
    assert_eq!(
        result.environment.differing_axes,
        vec![ReplayAxis::PathSeparator]
    );
    assert!(
        !result.environment.material_mismatch,
        "path separator is a documented, non-material axis"
    );
    let message = replay_success_message(&result);
    assert!(message.contains("path_separator"), "{message}");

    // Material difference: the recording host reported another OS.
    let mut bundle = to_bundle(CaseSeed {
        id: 4_243,
        payload: vec![0xA0, 0x01],
    });
    let mut recorded = EnvironmentFingerprint::capture();
    recorded.os = "<captured-elsewhere>".to_string();
    bundle.environment = Some(recorded);

    let result = replay_seed_bundle(&bundle);
    assert!(result.matches);
    assert!(result.environment.material_mismatch);
    assert_eq!(result.environment.differing_axes, vec![ReplayAxis::Os]);
    assert!(
        replay_success_message(&result).contains("recorded os '<captured-elsewhere>'"),
        "the differing axis must be named in the replay output"
    );
}

/// Bundles without a recorded environment (every bundle this suite produces)
/// stay quiet: no axis to compare, no warning to scroll past.
#[test]
fn bundles_without_a_recorded_environment_stay_quiet() {
    for seed in all_seeds().into_iter().take(4) {
        let result = replay_seed_bundle(&to_bundle(seed));
        assert!(result.environment.differing_axes.is_empty());
        assert!(result.environment.warnings.is_empty());
        assert!(!replay_success_message(&result).contains("environment"));
    }
}
