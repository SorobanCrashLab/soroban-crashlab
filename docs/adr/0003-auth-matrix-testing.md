# ADR-0003: Multi-Mode Soroban Auth Matrix Testing

**Status:** Accepted
**Date:** 2026-07-20

## Context
Soroban smart contracts handle authorization differently based on the execution context. The Soroban Host API provides several modes, notably:
- `Enforce`: Strict enforcement of authorization signatures (used in live network execution).
- `Record`: Records authorization events without enforcing them (used during transaction simulation and fee estimation).
- `RecordAllowNonroot`: Records auth events but bypasses strict root invocation checks (useful for cross-contract simulation).

Subtle bugs often arise where a contract behaves differently during `Record` simulation than it does during `Enforce` execution. If an attacker discovers such a divergence, they can craft transactions that simulate successfully but leak state or fail unexpectedly on-chain (or vice-versa).

## Decision
We implemented a mandatory Auth Matrix execution strategy in `auth_matrix.rs`. Rather than executing a mutated seed once, the fuzzing engine clones the host environment and executes the exact same input sequentially across all three primary authorization modes (`Enforce`, `Record`, `RecordAllowNonroot`). 

The outcomes are compared, and a `MatrixReport` is generated. Any deviation in the resulting ledger state modifications, return values, or panic behaviors between the modes is flagged as a potential authorization divergence vulnerability.

## Rationale
- Testing only under `Enforce` mode misses simulation-specific edge cases.
- Testing only under `Record` mode guarantees authorization bypasses will go undetected.
- Parallel or sequential execution of the identical input across all modes is the only reliable way to prove execution isomorphism.

## Consequences
- **Positive:** Proactively catches insidious authorization bypasses and state-leaks that standard unit testing routinely misses.
- **Negative:** Effectively triples the computational overhead for every fuzz iteration, reducing raw inputs-per-second throughput.
- **Mitigations:** Matrix testing can be disabled via CLI flags for rapid, shallow fuzzing runs where sheer coverage velocity is prioritized over deep auth auditing.

## Compliance & Verification
The `run_matrix()` function is the choke point for all seed executions in `crashlab-core`. Unit tests within `threat_model_tests.rs` specifically verify that introduced auth-divergence bugs correctly trigger a matrix mismatch alert.
