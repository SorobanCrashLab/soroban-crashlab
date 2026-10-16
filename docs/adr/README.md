# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for Soroban CrashLab. We use ADRs to document significant architectural and design choices, providing context, rationale, and consequences for future maintainers and contributors.

## Current ADRs

One line each: what was decided and what it costs. Every `NNNN-*.md` file in
this directory must appear here — `scripts/check-doc-links.mjs` fails CI
otherwise.

| ADR | Status | Decision | Consequence |
|-----|--------|----------|-------------|
| [ADR-0001](0001-two-tier-architecture.md) Two-tier architecture | Accepted | Rust engine (`crashlab-core`) and Next.js dashboard (`apps/web`) are separate tiers that talk only through JSON artifacts and REST. | Each tier is fast and idiomatic, but full-stack features need both languages and the JSON schemas are a contract. |
| [ADR-0002](0002-deterministic-replay-prng.md) Deterministic replay & PRNG | Accepted | A seeded XOR-shift PRNG, deterministic seed ids and an isolated host environment make every run reproducible. | Every crash replays exactly; mutations may not depend on network or wall-clock state. |
| [ADR-0003](0003-auth-matrix-testing.md) Auth matrix testing | Accepted | Each seed runs under `Enforce`, `Record` and `RecordAllowNonroot`; divergence is flagged. | Catches authorization bypasses at roughly 3× execution cost (can be disabled for shallow runs). |
| [ADR-0004](0004-failure-classification-taxonomy.md) Failure classification taxonomy | Accepted | Failures are bucketed by a deterministic taxonomy plus a signature hash. | Triage works on root causes, not volume; changing the taxonomy re-buckets stored crashes. |
| [ADR-0005](0005-flaky-detection-and-ci-quarantine.md) Flaky detection & CI quarantine | Accepted | A failure is re-executed N times before export; unstable ones are quarantined. | No flaky regressions reach user CI, at the cost of longer failure finalization. |
| [ADR-0006](0006-pluggable-artifact-storage-and-sanitization.md) Pluggable artifact storage & sanitization | Accepted | Storage sits behind the `ArtifactStore` trait; the local store enforces safe names and strips hostile content. | New backends drop in; hostile artifacts cannot traverse paths, at some trait/async complexity. |
| [ADR-0007](0007-standalone-web-dashboard-with-mock-fallback.md) Standalone dashboard with mock fallback | Accepted | Every route and hook falls back to in-memory mock data when the backend is unreachable. | UI work needs no backend; mock and real schemas must be kept in step via shared types. |
| [ADR-0008](0008-run-lifecycle-and-checkpoint-recovery.md) Run lifecycle & checkpoint recovery | Accepted | Runs follow an explicit state machine with cooperative cancellation and atomic periodic checkpoints. | Long campaigns survive interruption and stop promptly, with small checkpoint I/O overhead. |

## When to write an ADR

Write one **before** the implementation PR when a change:

- adds or changes a cross-tier contract (bundle/corpus/checkpoint schema, API
  shape, CLI output relied on by scripts);
- changes determinism, classification or signature behaviour;
- introduces a security or tenancy model, a new storage backend, or a new
  external dependency class;
- is a "large, stacked PRs" issue — those name the ADR as the first step.

If you are unsure, ask on the issue; a short ADR is cheaper than a rework.
The contributor guides link here from
[where to start](../contributors/where-to-start.md#contribution-workflow-recap).

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
