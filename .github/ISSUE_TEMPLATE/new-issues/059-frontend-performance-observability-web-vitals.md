---
name: "Frontend: Performance Observability & Web Vitals - RUM, Budgets, Regression Alerts & Optimization Insights"
description: "Implement frontend performance observability with Real User Monitoring, Core Web Vitals tracking, route-level budgets, regression alerts, and actionable optimization dashboards"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Performance tooling exists in parts (Lighthouse CI, perf harness scripts, bundle analysis), but there is no unified runtime observability for real users and no product-facing visibility into frontend performance health.

Issues:
- No RUM/Core Web Vitals collection segmented by route/device/network
- Performance regressions detected late (CI only) without production correlation
- No dashboard for long-task, interaction latency, hydration/route transition costs
- Limited attribution from user experience issues to releases/changes

## Proposed Solution

Build a **Frontend Performance Observability** system:
- Client instrumentation for Web Vitals (LCP, INP, CLS, FCP, TTFB) and custom timings
- Route/component-level performance marks for key flows (run detail load, table interactions)
- Budget definitions and regression detection integrated with CI signals
- Ops/dev dashboard for trends, regressions, and top offenders with drill-down

## Requirements

### Functional
- [ ] RUM instrumentation capturing Web Vitals and custom metrics with route/user-agent context
- [ ] Sampling, consent/privacy controls, and PII-safe payloads
- [ ] Performance budgets per route/feature with threshold configuration
- [ ] Regression detection comparing releases/time windows; alert hooks (#011/#041)
- [ ] Dashboard views: trends, percentile charts, route heatmap, slow interaction traces
- [ ] Correlation with release/version, feature flags (#029), and backend latency where available
- [ ] Developer guidance: profiling recipes and performance checklist integration

### Non-Functional
- [ ] Instrumentation overhead negligible (<1% CPU, minimal bundle impact)
- [ ] Reliable in SPA navigations and Next.js App Router transitions
- [ ] Data retention and aggregation policies configurable
- [ ] Secure transport and access-controlled metrics endpoints/UI

## Files to Modify / Create
```
apps/web/src/lib/perf/
├── vitals.ts
├── marks.ts
├── reporter.ts
├── budgets.ts
└── sampling.ts

apps/web/src/app/api/perf-metrics/
├── route.ts
└── summary/route.ts

apps/web/src/features/ops/performance/
├── PerformanceDashboard.tsx
├── RouteVitalsTable.tsx
├── RegressionAlerts.tsx
└── hooks/usePerfMetrics.ts

docs/performance/
├── frontend-observability.md
└── budgets.md
```

## Acceptance Criteria
- Web Vitals and key custom timings collected and visualized by route/release
- Budget regressions detectable and alertable
- Teams can identify top performance offenders with actionable attribution
- Privacy/sampling controls implemented and documented

## PR Guide
- Branch: `issue/059-frontend-performance-observability`
- Phase 1: Instrumentation + ingestion endpoint + storage/aggregation
- Phase 2: Budgets + regression detection + alerts
- Phase 3: Dashboard UI + drill-downs
- Phase 4: CI correlation, docs, rollout

**Estimated effort:** 4-5 weeks (200 pts)