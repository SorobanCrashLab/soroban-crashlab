---
name: "Frontend: Data Quality & Freshness Monitoring UI - Pipeline Health, Staleness, Completeness, and Trust Indicators"
description: "Build a data quality and freshness monitoring experience that surfaces ingestion health, staleness, schema drift, completeness gaps, and trust indicators across dashboards and investigative views"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Dashboards and investigations depend on timely, complete data from fuzzing runs, artifacts, logs, metrics, and integrations. When pipelines lag or break, users may make incorrect decisions without knowing data is degraded:
- No unified visibility into data freshness, ingestion lag, or missing partitions/artifacts
- Schema/version drift and parser failures are hidden from end users
- UI does not communicate confidence/trust levels for metrics and derived insights
- Operators lack drill-down from symptoms (stale chart) to failing source/component
- Alerting and remediation workflows for data quality issues are fragmented

## Proposed Solution
Implement a **Data Quality & Freshness Monitoring UI**:
- Source/pipeline health dashboards (ingest rates, lag, error rates, completeness)
- Trust/freshness badges and warnings embedded in analytics and investigation views
- Schema drift and validation failure explorer with sample payloads and impact mapping
- SLA/SLO-style freshness objectives per dataset/view with breach tracking
- Guided remediation links to runbooks, integrations, and incident workflows

## Requirements
### Functional
- [ ] Inventory monitored datasets/sources (runs, traces, logs, metrics, artifacts, integrations) with ownership metadata
- [ ] Freshness/lag charts, completeness metrics, and error/parsing failure summaries by source and time window
- [ ] UI trust indicators: "fresh/stale/degraded/unknown" badges with last-updated timestamps and provenance
- [ ] Schema/version drift detection views with diff summaries and affected consumers
- [ ] Impact analysis: which dashboards/entities/features rely on degraded datasets
- [ ] Alert configuration hooks and incident/runbook integration for breaches (#049/#066/#080)
- [ ] Drill-down to raw ingestion events/logs and retry/reprocess actions where permitted (#075/#070)
- [ ] Shareable status reports and historical quality trend exports (#043)

### Non-Functional
- [ ] Efficient aggregation for long time ranges and many sources
- [ ] Clear, non-alarmist UX that avoids false certainty; explicit unknown states
- [ ] Permission-aware visibility into operational diagnostics and payload samples
- [ ] Accessible status indicators (not color-only) and responsive layouts

## Files to Modify / Create
```
apps/web/src/features/data-quality/
├── DataQualityDashboard.tsx
├── FreshnessBadges.tsx
├── SchemaDriftPanel.tsx
├── DatasetImpactView.tsx
└── hooks/useDataQuality.ts

apps/web/src/app/ops/data-quality/page.tsx
apps/web/src/app/api/data-quality/status/route.ts
apps/web/src/app/api/data-quality/drift/route.ts
apps/web/src/lib/data-quality/
├── models.ts
├── scoring.ts
└── indicators.ts
docs/ops/data-quality-freshness-ui.md
```

## Acceptance Criteria
- Users can identify stale/incomplete/drifting data sources and understand impact
- Key product views display trustworthy freshness/confidence indicators
- Breaches integrate with alerting/incident/remediation workflows
- Performance, accessibility, and permission requirements met

## PR Guide
- Branch: `issue/084-frontend-data-quality-freshness-monitoring`
- Phase 1: source models + status APIs/UI + freshness badges
- Phase 2: completeness/drift/impact views
- Phase 3: alerts/runbook/incident integrations + reports
- Phase 4: hardening, a11y, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
