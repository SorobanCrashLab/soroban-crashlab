# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for Soroban CrashLab. We use ADRs to document significant architectural and design choices, providing context, rationale, and consequences for future maintainers and contributors.

## Current ADRs

| ADR | Title | Status | Description |
|-----|-------|--------|-------------|
| [ADR-0001](0001-two-tier-architecture.md) | Two-Tier Split Architecture | Accepted | Decouples the Rust fuzzing engine from the Next.js web dashboard. |
| [ADR-0002](0002-deterministic-replay-prng.md) | Deterministic Replay & PRNG | Accepted | Ensures 100% reproducibility of discovered crashes via XOR-shift PRNG. |
| [ADR-0003](0003-auth-matrix-testing.md) | Multi-Mode Auth Matrix Testing | Accepted | Tests seeds across Enforce, Record, and RecordAllowNonroot auth modes. |
| [ADR-0004](0004-failure-classification-taxonomy.md) | Failure Classification Taxonomy | Accepted | Categorizes and hashes failures to deduplicate crashes into distinct triage clusters. |
| [ADR-0005](0005-flaky-detection-and-ci-quarantine.md) | Flaky Detection & CI Quarantine | Accepted | Prevents unstable crashes from entering CI by detecting and quarantining flaky failures. |
| [ADR-0006](0006-pluggable-artifact-storage-and-sanitization.md) | Pluggable Artifact Storage & Sanitization | Accepted | Provides a secure, trait-based storage system for handling adversarial test artifacts. |
| [ADR-0007](0007-standalone-web-dashboard-with-mock-fallback.md) | Standalone Dashboard with Mock Fallback | Accepted | Allows frontend development without a local blockchain node or active Rust backend. |
| [ADR-0008](0008-run-lifecycle-and-checkpoint-recovery.md) | Run Lifecycle & Checkpoint Recovery | Accepted | Ensures safe cancellation and state recovery during long-running fuzzing campaigns. |

---

## How to Create an ADR

When making a significant architectural decision, create a new file in this directory following the `NNNN-short-title.md` naming convention (where `NNNN` is the next available sequence number). Use the template below.

### ADR Template

```markdown
# ADR-NNNN: [Title of the Decision]

**Status:** [Proposed | Accepted | Superseded | Deprecated]
**Date:** [YYYY-MM-DD]

## Context
Describe the problem, business drivers, technical constraints, or architectural forces that prompted this decision.

## Decision
What is the specific choice being made? Describe the technical design, patterns, or tools being adopted.

## Rationale
Why was this choice made over alternatives? What trade-offs are involved?

## Consequences
- **Positive:** What benefits does this decision bring?
- **Negative:** What are the downsides or ongoing costs?
- **Mitigations:** How will we address the negative consequences?

## Compliance & Verification
How is this decision enforced in the codebase or verified by CI/CD pipelines?
```
