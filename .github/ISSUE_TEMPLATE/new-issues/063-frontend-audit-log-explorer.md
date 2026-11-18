---
name: "Frontend: Audit Log Explorer - Forensic Search, Diff Views, Correlation & Compliance Exports"
description: "Build a comprehensive audit log explorer for security and operational forensics with advanced filtering, entity correlation, change diffs, and compliance-ready exports"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Audit events are produced across auth, settings, integrations, triage, and artifact operations, but there is no unified explorer for investigation and compliance.

Gaps:
- No centralized UI to search/filter audit logs by actor, action, resource, outcome, time
- Cannot correlate events across entities (run → triage → issue sync → webhook delivery)
- No before/after diff view for configuration and permission changes
- Limited export/reporting for compliance and incident response
- Insufficient tamper-evidence visibility and access controls

## Proposed Solution

Implement an **Audit Log Explorer**:
- High-performance searchable timeline/table with rich filters and saved queries
- Entity-centric views (user, token, campaign, run, integration) with correlated event chains
- JSON/config diff visualization for change events
- Export workflows (CSV/JSON/PDF evidence bundles) with redaction controls (#043/#053)
- Integration with security/compliance modules (#022/#024)

## Requirements

### Functional
- [ ] Audit log list with advanced filters: actor, actor type, action, resource type/id, outcome, severity, IP/source, correlation/request ID, time range
- [ ] Free-text and structured query support; saved searches and shareable links (#052/#056)
- [ ] Event detail drawer with raw payload, normalized fields, and related events
- [ ] Correlation graph/timeline across entities and distributed traces (#014/#034) where available
- [ ] Before/after diff viewer for config/policy/permission/integration changes
- [ ] Compliance exports and evidence bundles with filters, signatures/metadata, and access logging
- [ ] RBAC/ABAC-gated access; sensitive field masking/redaction by role
- [ ] Live tail/stream mode for active incident investigations

### Non-Functional
- [ ] Query performance targets for large audit volumes (server-side pagination/cursors)
- [ ] Immutable/tamper-evident presentation indicators (hash chain status where available)
- [ ] Accessible table/diff views and keyboard navigation
- [ ] Export jobs handle large datasets asynchronously

## Files to Modify / Create
```
apps/web/src/features/security/audit-explorer/
├── AuditExplorer.tsx
├── AuditFilters.tsx
├── AuditTable.tsx
├── AuditEventDrawer.tsx
├── CorrelationTimeline.tsx
├── DiffViewer.tsx
├── SavedAuditQueries.tsx
└── hooks/useAuditExplorer.ts

apps/web/src/app/audit/ (enhance/create explorer routes)
apps/web/src/app/api/audit/
├── events/route.ts
├── search/route.ts
├── correlations/route.ts
└── export/route.ts

docs/security/audit-log-explorer.md
```

## Acceptance Criteria
- Investigators can locate and correlate relevant audit events quickly
- Change diffs and evidence exports support incident/compliance workflows
- Access controls and redaction enforced consistently
- Performance and usability validated on large datasets

## PR Guide
- Branch: `issue/063-frontend-audit-log-explorer`
- Phase 1: Search/filter/table + event detail
- Phase 2: Correlation views + diffs
- Phase 3: Exports + saved queries + live tail
- Phase 4: RBAC/redaction hardening, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)