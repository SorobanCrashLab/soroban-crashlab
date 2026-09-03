# ADR-0005: Flaky Detection and CI Quarantine

**Status:** Accepted
**Date:** 2026-07-20

## Context
One of the primary goals of Soroban CrashLab is to export discovered failures into deterministic regression tests (`CaseBundle` artifacts) that can run in a project's continuous integration (CI) pipeline. 
However, smart contract host simulations can occasionally suffer from transient non-determinism—such as race conditions in off-chain data mock dependencies, host budget timing variance, or flaky test assertions. If Soroban CrashLab exports a flaky failure into a CI regression pack, it will cause spurious CI failures, breaking builds and destroying developer trust in the tool.

## Decision
We implemented a strict statistical stability verification gate known as the `FlakyDetector` (`reproducer.rs`).
Before any failure is exported as a CI regression artifact:
1. The engine automatically re-executes the exact `CaseSeed` $N$ times under identical conditions.
2. It measures the number of times the outcome diverges from the original failure signature.
3. A `flake_rate = divergent_runs / total_runs` is calculated.
4. If `flake_rate <= threshold` (usually 0), the failure is marked `stable`.
5. The `filter_ci_pack()` function guarantees that only 100% stable bundles are written to the CI regression output directory.

## Rationale
- Quarantining flaky tests prevents CI pipeline rot.
- Simply discarding flaky tests hides potential critical vulnerabilities (a flaky test might be a highly timing-dependent reentrancy vulnerability). Therefore, unstable bundles are not deleted; they are quarantined and prominently flagged on the Web Dashboard's Triage Board for manual engineering review.

## Consequences
- **Positive:** Zero false-positives injected into user CI pipelines. High developer trust.
- **Negative:** Increases the processing time required to finalize a failure report during the campaign.
- **Mitigations:** The re-execution parameter $N$ is configurable. It can be set lower for faster local dev loops, and higher for overnight CI integration runs.

## Compliance & Verification
The web dashboard enforces strict visual differentiation between stable CI-ready bundles and quarantined flaky bundles. The Rust core tests (`reproducer.rs`) validate this behavior by artificially introducing non-deterministic RNG into mock contracts and verifying they are caught and quarantined by the `FlakyDetector`.
