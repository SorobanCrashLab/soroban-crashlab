# ADR-0002: Deterministic Replay and PRNG

**Status:** Accepted
**Date:** 2026-07-20

## Context
Fuzzing smart contracts generates millions of inputs per campaign. If a crash or edge-case vulnerability is discovered, developers must be able to reproduce the exact state and input parameters that triggered it. Non-deterministic mutation strategies, stateful side-effects, or random number generators that rely on host entropy can result in "ghost bugs" that appear once and vanish, rendering the fuzzing run effectively useless for regression testing.

## Decision
We mandate strict determinism across the entire fuzzing pipeline:
1. **Pseudo-Random Number Generator (PRNG):** We implemented a custom, lightweight XOR-shift PRNG (`prng.rs`) seeded entirely by a deterministic campaign initialization parameter. 
2. **Seed Hashing:** Every `CaseSeed` is assigned a unique identifier derived from its mutation sequence and payload bytes.
3. **Environment Isolation:** The Soroban Host environment is initialized with identical ledger states and network configurations (`env_fingerprint.rs`) for each run.

## Rationale
- Using standard library entropy (`rand::thread_rng`) would break reproducibility.
- Deterministic IDs and mutation budgets guarantee that a specific fuzzing iteration (e.g., Run #42 -> Iteration #1337) will always yield the exact same XDR payload bytes and execution trace on any machine.
- This allows the `replay.rs` engine to reliably re-execute any `CaseBundle` imported from the web dashboard or CI pipeline.

## Consequences
- **Positive:** 100% reproducibility of all discovered crashes. Seamless export of fuzzing failures into standalone Rust integration tests for CI regression suites.
- **Negative:** Mutations cannot depend on external API responses or real-time network states.
- **Mitigations:** We mock all external contract cross-calls deterministically within the host simulation.

## Compliance & Verification
The `FlakyDetector` (see ADR-0005) continuously verifies reproducibility by re-running failure seeds. If the PRNG or host simulation loses determinism, the detector automatically flags the resulting failures as flaky, alerting maintainers to a regression in the determinism invariants.
