---
name: "Frontend: CI Checks & Quality Gates Dashboard - Unified PR/Commit Health, Flake Insights, and Release Readiness"
description: "Create a comprehensive frontend dashboard for CI checks, quality gates, flaky test signals, coverage/perf budgets, and release readiness correlated with runs and regressions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
CI/workflow signals are spread across GitHub and internal tools, making it hard to assess merge/release readiness:
- No unified view of checks, required gates, flaky jobs, and historical reliability
- Difficult to correlate CI failures with product regressions, runs, or environment drift
- Maintainers lack actionable release readiness summaries and blocking issue context
- Developers cannot quickly navigate from failing checks to logs/artifacts/evidence

## Proposed Solution
Implement a **CI Checks & Quality Gates Dashboard**:
- Aggregated PR/commit/branch/release views of workflow runs and required gates
- Flake detection insights, retry/quarantine visibility, and trend analysis (#090)
- Coverage/perf/visual/security gate status with threshold/budget context (#031/#059/#077)
- Deep links to logs, artifacts, incidents, and remediation runbooks

## Requirements
### Functional
- [ ] Ingest/display GitHub Actions/workflow data: runs, jobs, steps, checks, artifacts, durations
- [ ] Views: PR readiness, branch health, nightly/release readiness, flaky test leaderboard
- [ ] Gate cards: lint/test/e2e/coverage/mutation/perf/visual/security with pass/fail/budget deltas
- [ ] Correlate failures to regressions, incidents, code areas, and recent changes (#018/#066)
- [ ] Drill-down to logs/artifacts/snapshots and create/link issues or playbooks (#062/#080/#077)
- [ ] Filters/search/saved views and shareable status reports (#052/#056/#043)
- [ ] Notifications/subscriptions for gate regressions and required-check failures (#041/#049)

### Non-Functional
- [ ] Efficient polling/webhook-backed updates with rate-limit aware caching
- [ ] Accurate status normalization across workflow types and reruns
- [ ] Permission-aware access to repo/CI metadata and artifact links (#070)
- [ ] Accessible tables/cards/timelines and responsive layout

## Files to Modify / Create
```
apps/web/src/features/ci/
├── CiQualityDashboard.tsx
├── PrReadinessView.tsx
├── GateStatusCards.tsx
├── FlakeInsights.tsx
├── ReleaseReadiness.tsx
└── hooks/useCiQuality.ts

apps/web/src/app/quality/ci/page.tsx
apps/web/src/app/api/ci/runs/route.ts
apps/web/src/app/api/ci/gates/route.ts
docs/frontend/ci-quality-gates-dashboard.md
```

## Acceptance Criteria
- Teams can assess PR/release readiness from a single, accurate dashboard
- Failing/flaky gates are explainable with drill-down evidence and actions
- Correlations to regressions/incidents/issues improve response speed
- Data freshness, permissions, and accessibility handled correctly

## PR Guide
- Branch: `issue/093-frontend-ci-quality-gates-dashboard`
- Phase 1: CI ingestion models + core readiness views
- Phase 2: gate cards + flake insights + drill-downs
- Phase 3: correlations, notifications, saved/shareable reports
- Phase 4: resilience, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
