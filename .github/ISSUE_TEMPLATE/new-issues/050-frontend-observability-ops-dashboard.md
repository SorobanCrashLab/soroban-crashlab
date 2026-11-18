---
name: "Frontend: Observability & Operations Dashboard - System Health, Queue/Worker Status, SLOs & Incident Diagnostics"
description: "Build an operations-focused observability dashboard for system health, queues/workers, storage/integration status, SLO tracking, and incident diagnostics with actionable drill-downs"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Operational visibility is fragmented across logs, integrations, and ad-hoc health endpoints (`api/health`, integration pages). Maintainers/operators lack a unified view of platform health and bottlenecks.

Issues:
- No consolidated ops dashboard (API, workers, queues, storage, integrations)
- Limited SLO/SLI visibility and error budget tracking
- Hard to correlate incidents with campaigns/runs/integration failures
- No actionable drill-down from symptoms to diagnostics

## Proposed Solution

Create an **Observability & Operations Dashboard**:
- Unified system health overview with SLI/SLO panels
- Queue/worker throughput, backlog, retry/DLQ metrics
- Storage and integration health status with trend charts
- Incident timeline/correlation view linking to runs, webhooks, deployments, alerts
- Drill-down pages and runbooks links for common failure modes

## Requirements

### Functional
- [ ] Ops overview: service health, API latency/error rates, worker/queue status, storage health
- [ ] SLO panels: availability, latency, webhook delivery success, processing backlog with error budgets
- [ ] Integration/infra health cards (webhooks, GitHub, Slack/PD, storage drivers, Redis/DB)
- [ ] Incident diagnostics view: correlated timeline of alerts, deploys, failures, and impacted runs/campaigns
- [ ] Drill-down links to logs, traces (#014), webhook deliveries (#011), and failing jobs
- [ ] Configurable time ranges, filters, and environment/workspace scoping
- [ ] Alert thresholds visualization and links to notification/automation rules (#041/#049)

### Non-Functional
- [ ] Near real-time updates (SSE/polling) without UI degradation
- [ ] Efficient queries/aggregations for large time windows
- [ ] Role-based access (ops/maintainer views) and audit for config changes
- [ ] Accessible charts/tables and exportable snapshots

## Files to Modify / Create
```
apps/web/src/features/ops/observability/
├── OpsDashboard.tsx
├── panels/
│   ├── ServiceHealthPanel.tsx
│   ├── QueueWorkerPanel.tsx
│   ├── SLOPanel.tsx
│   ├── IntegrationHealthPanel.tsx
│   └── IncidentTimelinePanel.tsx
├── drilldown/
│   ├── DiagnosticsView.tsx
│   └── CorrelationView.tsx
└── hooks/useOpsMetrics.ts

apps/web/src/app/ops/
├── page.tsx
├── incidents/page.tsx
└── health/page.tsx

apps/web/src/app/api/ops/
├── metrics/route.ts
├── health-summary/route.ts
├── incidents/route.ts
└── correlations/route.ts

docs/ops/
├── observability-dashboard.md
└── runbooks-index.md
```

## Acceptance Criteria
- Operators can identify system health issues and root-cause paths from one dashboard
- SLO/error budget status visible with drill-down diagnostics
- Integration and queue failures correlated with impacted workloads
- Real-time updates and RBAC controls implemented

## PR Guide
- Branch: `issue/050-frontend-observability-ops-dashboard`
- Phase 1: Metrics API aggregation + overview dashboard
- Phase 2: SLO panels + queue/worker/storage/integration health
- Phase 3: Incident correlation/timeline + drill-downs
- Phase 4: RBAC, exports, docs, tests
- Coordinate with #014 (tracing), #011 (webhooks), #017 (live metrics)

**Estimated effort:** 5-6 weeks (200 pts)