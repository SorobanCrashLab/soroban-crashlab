# Architecture

This document describes the system architecture of Soroban CrashLab, including the data flow between the fuzzer generator and web dashboard.

> **Note:** For in-depth rationale on specific design choices (e.g., why we use XOR-shift PRNG, why we enforce a multi-tier split), please refer to the [Architecture Decision Records (ADRs)](adr/README.md).

## System Overview

```
                            Soroban CrashLab Architecture
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                                                                             │
    │  ┌───────────────────────────────────────────────────────────────────────┐  │
    │  │                        crashlab-core (Rust)                           │  │
    │  │                                                                       │  │
    │  │   ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐       │  │
    │  │   │   Seed      │     │   Mutator   │     │   Classifier     │       │  │
    │  │   │  Generator  │────▶│             │────▶│                  │       │  │
    │  │   │             │     │ mutate_seed │     │ classify/taxonomy│       │  │
    │  │   └─────────────┘     └─────────────┘     └────────┬─────────┘       │  │
    │  │                                                    │                 │  │
    │  │                         ┌──────────────────────────┴───────┐         │  │
    │  │                         ▼                                  ▼         │  │
    │  │              ┌──────────────────┐            ┌──────────────────┐    │  │
    │  │              │  Auth Matrix     │            │  Flaky Detector  │    │  │
    │  │              │  Runner          │            │  (Reproducer)    │    │  │
    │  │              │                  │            │                  │    │  │
    │  │              │ Enforce/Record/  │            │ Stability check  │    │  │
    │  │              │ RecordAllowNonroot│           │ for CI packs     │    │  │
    │  │              └────────┬─────────┘            └────────┬─────────┘    │  │
    │  │                       │                               │              │  │
    │  │                       └───────────────┬───────────────┘              │  │
    │  │                                       ▼                              │  │
    │  │                          ┌────────────────────┐                      │  │
    │  │                          │  CaseBundle        │                      │  │
    │  │                          │  ─────────         │                      │  │
    │  │                          │  seed + signature  │                      │  │
    │  │                          │  + matrix report   │                      │  │
    │  │                          │  + repro status    │                      │  │
    │  │                          └─────────┬──────────┘                      │  │
    │  │                                    │                                 │  │
    │  └────────────────────────────────────┼─────────────────────────────────┘  │
    │                                       │                                    │
    │                                       │ JSON/API                           │
    │                                       ▼                                    │
    │  ┌────────────────────────────────────────────────────────────────────┐   │
    │  │                         apps/web (Next.js)                         │   │
    │  │                                                                    │   │
    │  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │   │
    │  │   │  Run History   │  │ Failure Triage │  │ Replay Control │      │   │
    │  │   │  Dashboard     │  │ View           │  │ Panel          │      │   │
    │  │   └────────────────┘  └────────────────┘  └────────────────┘      │   │
    │  │                                                                    │   │
    │  └────────────────────────────────────────────────────────────────────┘   │
    │                                                                             │
    └─────────────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### crashlab-core (Rust Crate)

The core fuzzing engine lives in `contracts/crashlab-core/`. It handles all seed generation, mutation, classification, and reproducibility verification.

| Module | Responsibility |
|--------|----------------|
| `lib.rs` | Core types (`CaseSeed`, `CrashSignature`, `CaseBundle`), mutation and classification entry points |
| `taxonomy.rs` | Failure classification into categories: Auth, Budget, State, Xdr, EmptyInput, OversizedInput, Unknown |
| `auth_matrix.rs` | Runs seeds across three Soroban auth modes (Enforce, Record, RecordAllowNonroot) to detect mode-sensitive behavior |
| `reproducer.rs` | `FlakyDetector` verifies failure stability; `filter_ci_pack` excludes flaky cases from CI regression packs |
| `seed_validator.rs` | `SeedSchema` enforces payload size and ID bounds before fuzzing |

### apps/web (Next.js Frontend)

The dashboard in `apps/web/` provides visibility into fuzzing runs and triage workflows.

- **Run History** — lists past fuzzing campaigns with summary stats
- **Failure Triage** — groups failures by signature and classification for review
- **Replay Control** — triggers deterministic replay of specific seeds

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Fuzzing Pipeline                              │
└──────────────────────────────────────────────────────────────────────────┘

1. SEED GENERATION
   ┌──────────────┐
   │ CaseSeed     │  Raw seed with id + payload bytes
   │ { id, payload}│
   └──────┬───────┘
          │
          ▼
2. MUTATION
   ┌──────────────┐
   │ mutate_seed  │  XOR-based deterministic mutation
   └──────┬───────┘
          │
          ▼
3. CLASSIFICATION
   ┌──────────────┐         ┌───────────────────────────────────────┐
   │ classify()   │────────▶│ CrashSignature                        │
   │ taxonomy     │         │ { category, digest, signature_hash }  │
   └──────────────┘         └───────────────────────────────────────┘
          │
          │  Categories:
          │  ├── empty-input      (payload empty)
          │  ├── oversized-input  (payload > 64 bytes)
          │  ├── xdr              (0x00-0x1F first byte)
          │  ├── state            (0x20-0x5F first byte)
          │  ├── budget           (0x60-0x9F first byte)
          │  └── auth             (0xA0-0xFF first byte)
          │
          ▼
4. AUTH MATRIX TESTING
   ┌──────────────────────────────────────────────────────────────┐
   │ run_matrix() executes seed under each AuthMode:              │
   │                                                              │
   │   Enforce ─────────┐                                         │
   │                    ├──▶ MatrixReport { mismatches }          │
   │   Record ──────────┤                                         │
   │                    │                                         │
   │   RecordAllowNonroot                                         │
   └──────────────────────────────────────────────────────────────┘
          │
          ▼
5. STABILITY VERIFICATION
   ┌──────────────────────────────────────────────────────────────┐
   │ FlakyDetector.check() re-runs seed N times                   │
   │                                                              │
   │   → flake_rate = divergent_runs / total_runs                 │
   │   → is_stable  = flake_rate <= threshold                     │
   │                                                              │
   │ filter_ci_pack() excludes unstable bundles from CI fixtures  │
   └──────────────────────────────────────────────────────────────┘
          │
          ▼
6. OUTPUT
   ┌──────────────────────────────────────────────────────────────┐
   │ CaseBundle = seed + signature + matrix_report + repro_status │
   │                                                              │
   │ Stable bundles → exported as deterministic regression tests  │
   │ Unstable bundles → quarantined for manual review             │
   │                                                              │
   │ All results → surfaced in web dashboard for triage           │
   └──────────────────────────────────────────────────────────────┘
```

## Integration Points

| From | To | Format | Purpose |
|------|----|--------|---------|
| crashlab-core | apps/web | JSON | Failure reports, run summaries, seed metadata |
| apps/web | crashlab-core | CLI/API | Replay requests, campaign configuration |
| crashlab-core | CI | Rust test fixtures | Deterministic regression tests from stable failures |

## Directory Structure

```
soroban-crashlab/
├── apps/
│   └── web/                    # Next.js dashboard
│       └── src/app/            # React components
├── contracts/
│   └── crashlab-core/          # Rust fuzzing engine
│       └── src/
│           ├── lib.rs          # Core types and mutation
│           ├── taxonomy.rs     # Failure classification
│           ├── auth_matrix.rs  # Auth mode testing
│           ├── reproducer.rs   # Stability detection
│           └── seed_validator.rs # Schema validation
├── docs/
│   └── ARCHITECTURE.md         # This file
├── scripts/                    # Issue management automation
└── ops/                        # Wave backlog and TSV data
```
