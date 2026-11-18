---
name: "Frontend: Multi-Run Regression & Compatibility Matrix - Cross-Version, Cross-Environment, and Cross-Target Outcome Analysis"
description: "Build a matrix-driven UI to compare outcomes across runs, commits, environments, networks, and targets, highlighting regressions, incompatibilities, and stability deltas"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Regressions and compatibility issues emerge across dimensions (engine version, contract commit, network/RPC, runner mode). Pairwise comparisons are insufficient:
- No matrix view to see pass/fail/crash/perf outcomes across many configurations
- Hard to isolate which dimension introduced regressions or instability
- Flaky/non-deterministic results obscure true compatibility signals (#090)
- Findings are not easily promoted into triage issues, baselines, or release gates (#061/#102)

## Proposed Solution
Implement a **Regression & Compatibility Matrix**:
- Configurable matrix axes (version, env, target, seed set, runner, date window)
- Cell-level outcome summaries with drill-down to representative runs/diffs/traces
- Regression detection, bisect hints, and stability/confidence overlays
- Baseline management and export for CI/release readiness workflows

## Requirements
### Functional
- [ ] Matrix builder: select axes, filters, metrics (status, crash rate, signature set, perf budgets)
- [ ] Cell detail: aggregated stats, representative runs, top signatures, and quick diff links (#067/#089)
- [ ] Regression highlighting vs baselines with trend deltas and confidence indicators
- [ ] Dimension isolation insights (e.g., fails only on RPC+testnet+commit X)
- [ ] Integration with flaky detection to annotate unstable cells (#090)
- [ ] Save/share matrix views, export CSV/JSON/PDF, and create issues from cells (#052/#043/#062)
- [ ] Feed release readiness/CI quality gates with matrix summaries (#102/#093)

### Non-Functional
- [ ] Efficient querying/aggregation for large run sets; virtualized matrix rendering
- [ ] Deterministic computations and reproducible shared views
- [ ] Accessible table/matrix navigation and non-color status encodings (#038)
- [ ] Permission-aware filtering of restricted runs/environments

## Files to Modify / Create
```
apps/web/src/features/regression-matrix/
├── RegressionMatrix.tsx
├── MatrixBuilder.tsx
├── MatrixCellDetail.tsx
├── BaselineManager.tsx
└── hooks/useRegressionMatrix.ts

apps/web/src/app/analysis/regression-matrix/page.tsx
apps/web/src/app/api/regression-matrix/route.ts
docs/frontend/regression-compatibility-matrix.md
```

## Acceptance Criteria
- Users can identify regressions/incompatibilities across multi-dimensional configurations
- Matrix cells provide trustworthy summaries and fast drill-down to evidence
- Views are shareable/exportable and integrate with triage/release workflows

## PR Guide
- Branch: `issue/109-frontend-regression-compatibility-matrix`
- Phase 1: matrix model/builder + aggregation APIs
- Phase 2: visualization/cell details + drill-downs
- Phase 3: baselines, flake/confidence overlays, exports/integrations
- Phase 4: perf/a11y/permissions tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
