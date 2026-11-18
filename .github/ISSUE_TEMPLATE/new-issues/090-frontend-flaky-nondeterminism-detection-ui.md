---
name: "Frontend: Flaky & Non-Determinism Detection UI - Stability Analysis, Replay Variance, and Quarantine Workflows"
description: "Provide a dedicated UI to detect, analyze, and manage flaky or non-deterministic fuzz outcomes with replay variance analysis, environment correlation, and quarantine controls"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Non-deterministic failures erode trust in fuzzing and waste triage time. Users need clear signals and tools to distinguish product bugs from instability:
- No consolidated view of flaky tests/runs/crashes and their variance over replays
- Hard to correlate non-determinism with environment, runner, seed mutation, or timing factors
- Quarantine/suppression decisions lack evidence and lifecycle management
- CI and campaign pipelines cannot easily consume stability insights

## Proposed Solution
Build a **Flaky & Non-Determinism Detection UI**:
- Stability dashboards and entity-level flake scores with confidence intervals
- Replay variance explorer comparing outcomes, traces, and state across repeated executions (#067/#072)
- Environment/runner correlation analysis and suspected-cause hints
- Quarantine workflow with approvals, expiry/re-evaluation, and audit trail

## Requirements
### Functional
- [ ] Detect/list flaky entities (runs, crash signatures, reproducers, suites) with stability metrics
- [ ] Variance views: outcome matrix across N replays, divergence points, timing/resource sensitivity
- [ ] Correlation filters by runner type, host version, network/RPC, commit, seed, and concurrency
- [ ] Quarantine/suppress/mark-flaky actions with rationale, scope, TTL, and auto recheck (#070/#063)
- [ ] Integration with CI status, regression gates, and campaign policies (#093/#018)
- [ ] Notifications and saved views for teams tracking stability (#041/#052)
- [ ] Export stability reports and evidence bundles (#043/#069)

### Non-Functional
- [ ] Statistically sound scoring presentation (sample size, confidence, recency weighting)
- [ ] Scales to large replay histories with aggregated queries
- [ ] Accessible charts/tables and clear status semantics
- [ ] Deterministic computations for same datasets/parameters

## Files to Modify / Create
```
apps/web/src/features/stability/
├── FlakyDashboard.tsx
├── ReplayVarianceExplorer.tsx
├── StabilityScorecard.tsx
├── QuarantineWorkflow.tsx
└── hooks/useStability.ts

apps/web/src/app/quality/flaky/page.tsx
apps/web/src/app/api/stability/route.ts
apps/web/src/app/api/stability/quarantine/route.ts
docs/frontend/flaky-nondeterminism-detection.md
```

## Acceptance Criteria
- Users can identify and explain flaky/non-deterministic behavior with evidence
- Quarantine decisions are controlled, auditable, and reversible/expiring
- Stability signals integrate with CI/regression workflows
- UI is performant, accessible, and statistically transparent

## PR Guide
- Branch: `issue/090-frontend-flaky-nondeterminism-detection`
- Phase 1: scoring models + dashboards/lists
- Phase 2: replay variance + correlation analysis
- Phase 3: quarantine workflows + CI/regression integrations
- Phase 4: reporting, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
