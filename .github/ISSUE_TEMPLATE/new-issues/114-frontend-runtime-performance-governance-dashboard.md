---
name: "Frontend: Runtime Performance Governance Dashboard - Budgets, Regressions, Profiling Insights, and Optimization Workflows"
description: "Implement a governance-focused frontend performance dashboard that tracks runtime budgets, detects regressions, surfaces profiling insights, and drives optimization tasks to resolution"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Performance instrumentation (#059) and CI checks exist, but teams need an operational governance layer to manage frontend performance over time:
- Budgets/thresholds are not centrally defined, owned, and enforced with clear accountability
- Runtime regressions across routes/devices/releases are hard to triage and prioritize
- Profiling evidence and optimization actions are disconnected from issues/releases
- High-cost surfaces (trace/diff/canvas/grid views) require targeted monitoring

## Proposed Solution
Build a **Runtime Performance Governance Dashboard**:
- Budget registry per route/surface/metric with ownership and escalation policies
- Regression detection views correlating RUM, CI, and release data
- Profiling insight cards (long tasks, render hotspots, bundle/interaction issues) with evidence
- Workflow integration to create/track optimization issues and verify fixes

## Requirements
### Functional
- [ ] Budget definitions: LCP/INP/CLS/TTFB, route interaction latency, long tasks, bundle/runtime thresholds
- [ ] Dashboards by route, device class, geography, workspace, and release/version (#059/#071)
- [ ] Regression alerts and trend analysis with baseline comparisons and anomaly detection (#019/#078)
- [ ] Drill-down to sessions/profiles/traces and affected features (diff, trace, grid, canvas) (#106/#067/#111)
- [ ] Optimization workflow: create/link issues, assign owners, track status, verify post-fix improvements (#062/#102)
- [ ] Export governance reports and readiness summaries for releases (#043/#102)
- [ ] Permission-aware controls for budget policy changes and audit logging (#070/#063)

### Non-Functional
- [ ] Scalable aggregation and responsive charts for large telemetry volumes
- [ ] Privacy-safe metrics handling and sampling transparency
- [ ] Accessible dashboards and clear severity semantics
- [ ] Deterministic budget evaluation for release decisions

## Files to Modify / Create
```
apps/web/src/features/perf-governance/
├── PerformanceGovernanceDashboard.tsx
├── BudgetRegistry.tsx
├── RegressionInsights.tsx
├── OptimizationWorkflow.tsx
└── hooks/usePerfGovernance.ts

apps/web/src/app/ops/performance-governance/page.tsx
apps/web/src/app/api/perf-governance/budgets/route.ts
apps/web/src/app/api/perf-governance/regressions/route.ts
docs/frontend/runtime-performance-governance.md
```

## Acceptance Criteria
- Teams can define, monitor, and enforce frontend performance budgets
- Regressions are detectable, attributable, and trackable to resolution
- Release/perf governance decisions are evidence-backed and auditable

## PR Guide
- Branch: `issue/114-frontend-runtime-performance-governance`
- Phase 1: budget model/registry + core dashboards
- Phase 2: regression detection/correlation + drill-downs
- Phase 3: optimization workflow + release/report integrations
- Phase 4: privacy/a11y/perf hardening, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
