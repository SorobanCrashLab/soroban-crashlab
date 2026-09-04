# ADR-0008: Run Lifecycle and Checkpoint Recovery

**Status:** Accepted
**Date:** 2026-07-20

## Context
Smart contract fuzzing campaigns in Soroban CrashLab can run for extended periods, ranging from a few minutes for a quick sanity check to several days for deep, stateful property exploration.
During these long-running executions, several operational issues can arise:
1. The user may wish to pause or gracefully cancel a run from the web dashboard.
2. The host machine may crash, reboot, or run out of memory.
If the engine merely runs a monolithic `while` loop in memory, an interruption results in the complete loss of all discovered crash signatures, metrics, and progress.

## Decision
We implemented a robust Asynchronous Run Lifecycle Management system backed by atomic checkpoints (`checkpoint.rs`, `run_control.rs`):
1. **State Machine:** Campaigns explicitly transition between `running`, `paused`, `cancelling`, `cancelled`, and `completed` states.
2. **Cooperative Cancellation:** The core fuzzing loop routinely checks an atomic cancellation token. When a cancellation is requested via the API, the engine finishes its current mutation budget slice, flushes metrics, and gracefully exits.
3. **Atomic Checkpointing:** Periodically (e.g., every 10,000 iterations or every 60 seconds), the engine serializes its current PRNG state, coverage metrics, and taxonomy clusters to a `.checkpoint` file.

## Rationale
- Cooperative cancellation is vastly superior to hard-killing the process (`SIGKILL`), as it allows the engine to save the exact `CaseBundle` artifacts of failures discovered just prior to the cancellation.
- Atomic checkpointing ensures that if the process *is* hard-killed, the campaign can resume from the last known good state without repeating hours of mutation work.

## Consequences
- **Positive:** No lost work on long campaigns. Highly responsive user experience when stopping runs from the web dashboard.
- **Negative:** Adds slight IO overhead during the checkpoint serialization phase.
- **Mitigations:** Checkpoints are performed asynchronously or batched at sensible intervals so they do not block the tight execution loop of the Soroban Host simulation.

## Compliance & Verification
The `checkpoint.rs` module contains tests that simulate process interruption mid-run, asserting that deserializing the checkpoint successfully resumes the PRNG sequence exactly where it left off. The `run_control.rs` module tests verify that cancellation tokens are respected within bounded time limits.
