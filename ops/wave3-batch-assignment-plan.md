# Wave 3 Batch Assignment Plan (Conflict-Aware)

This plan is designed to reduce contributor collisions and dependency stalls.

## Rules used

- Parallel-safe means different files/surfaces and no hard prerequisite.
- Sidelined means blocked by a prerequisite issue and should not be assigned early.
- Batch order is optimized for throughput and low merge conflict risk.

## 1) Parallel-Safe Pool (Assign Anytime)

These are low-conflict issues you can assign immediately in parallel.

- Add label bootstrap automation
- Add CODEOWNERS for review routing
- Add maintainer response-time dashboard query
- Add RFC template for high-complexity work
- Add stale label auto-suggestion script
- Create architecture diagram documentation
- Write contributor local setup guide
- Document wave issue complexity rubric
- Create maintainer onboarding checklist
- Add issue dependency mapping guide
- Implement secret scanning guidance for contributors
- Add security policy and disclosure path
- Add conflict-of-interest maintainer policy
- Add dependency update safety policy
- Add quality gates checklist to PR flow
- Add contributor SLA section with timers
- Document issue triage board queries
- Define escalation policy for blocked PRs
- Add backlog freshness review workflow
- Add weekly triage cadence automation

## 2) Sidelined Dependency Chains (Strict Order)

Do not assign later items in a chain until all prior items are complete.

### Chain A: Deterministic replay and reproducibility

1. Implement seed schema validator
2. Add deterministic PRNG adapter
3. Persist failing case bundle format
4. Add replay command for single seed
5. Add environment fingerprinting to bundles
6. Write reproducibility guarantees documentation

### Chain B: Failure signature intelligence

1. Build failure classification taxonomy
2. Add crash signature hashing
3. Add duplicate crash de-dup index
4. Implement seed prioritization by novelty
5. Add baseline snapshot comparison
6. Add signature trend charts
7. Implement failure cluster view

### Chain C: Fixture and regression pipeline

1. Export failing seed as JSON scenario
2. Export failing seed as Rust regression fixture
3. Generate TypeScript reproducer snippets
4. Implement fixture metadata manifest
5. Add fixture compatibility checker
6. Add fixture lint command
7. Add deterministic ordering for exported suites
8. Add regression suite loader
9. Create automatic regression grouping
10. Implement flaky reproducer detector
11. Add fixture sanitization pipeline

### Chain D: Runtime reliability and live observability

1. Add simulation timeout guardrails
2. Add retry strategy for transient RPC failures
3. Capture RPC request response envelopes
4. Implement run metadata schema versioning
5. Implement run resume from checkpoint
6. Implement run health summary endpoint
7. Add live run progress timeline

### Chain E: Web triage UX progression

1. Build run history table UI
2. Build crash detail drawer UI
3. Build replay from UI action
4. Add shareable permalink for run report
5. Add downloadable run artifact bundle
6. Add markdown rendering for issue-ready reports

## 3) Ordered Assignment Batches

Each batch can be opened after the previous batch is mostly stable. Keep batch size around 12 to 18 active issues.

## Batch 1: Foundations and governance (lowest conflict)

- Add label bootstrap automation
- Add CODEOWNERS for review routing
- Add maintainer response-time dashboard query
- Add RFC template for high-complexity work
- Add stale label auto-suggestion script
- Create architecture diagram documentation
- Write contributor local setup guide
- Document wave issue complexity rubric
- Create maintainer onboarding checklist
- Add issue dependency mapping guide
- Add security policy and disclosure path
- Add conflict-of-interest maintainer policy

## Batch 2: Core engine baseline (unblocks most chains)

- Implement seed schema validator
- Add deterministic PRNG adapter
- Add simulation timeout guardrails
- Build failure classification taxonomy
- Persist failing case bundle format
- Add replay command for single seed
- Add mutation budget limiter per run
- Add run cancellation command
- Add stale run detector
- Add corpus seed import command
- Add corpus seed export command
- Add fuzz campaign preset profiles

## Batch 3: Signature + fixture core

- Add crash signature hashing
- Add duplicate crash de-dup index
- Export failing seed as JSON scenario
- Export failing seed as Rust regression fixture
- Generate TypeScript reproducer snippets
- Implement fixture metadata manifest
- Add fixture compatibility checker
- Add fixture lint command
- Add deterministic ordering for exported suites
- Add markdown crash report exporter
- Add reproducer shrinking algorithm

## Batch 4: Runtime hardening and data durability

- Add retry strategy for transient RPC failures
- Capture RPC request response envelopes
- Implement run metadata schema versioning
- Add environment fingerprinting to bundles
- Add failure artifact compression
- Add retention policy for run artifacts
- Implement run resume from checkpoint
- Implement run health summary endpoint
- Add deterministic parallel worker partitioning
- Implement weighted mutator scheduler

## Batch 5: Web triage and reporting

- Build run history table UI
- Build crash detail drawer UI
- Build replay from UI action
- Add run filtering by area and severity
- Add shareable permalink for run report
- Add downloadable run artifact bundle
- Add markdown rendering for issue-ready reports
- Add explicit loading and error states
- Add theme tokens for accessibility contrast
- Add keyboard navigation in dashboard
- Add empty-state onboarding cards
- Build campaign configuration form

## Batch 6: High-complexity finishers

- Add authorization mode matrix runner
- Add state change diff view
- Add live run progress timeline
- Add signature trend charts
- Implement failure cluster view
- Add baseline snapshot comparison
- Create automatic regression grouping
- Implement flaky reproducer detector
- Add fixture sanitization pipeline
- Implement seed prioritization by novelty
- Create threat model draft for artifact handling
- Write mutation strategy handbook
- Write release process documentation
- Add contributor debugging playbook
- Document security hardening assumptions

## 4) Quick assignment guidance

- Give first-time contributors tasks from Batch 1 or early Batch 2.
- Only assign Chain B and Chain C tail items after their prerequisites are merged.
- Keep at most 1 high-complexity issue per contributor active at a time.
- Avoid assigning multiple issues from the same chain to different people simultaneously unless predecessors are already merged.
