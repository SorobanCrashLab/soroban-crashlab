---
name: "Frontend: Data Export & Reporting Center - Unified Exports, Scheduled Reports, Formats & Delivery Tracking"
description: "Build a centralized export and reporting center supporting on-demand and scheduled exports (CSV/JSON/PDF), custom templates, delivery tracking, and permission-aware access"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Export/report capabilities are scattered (run CSV export, report modal/utils, reporting templates features) with limitations:
- No unified place to manage exports and reports
- Limited formats and no consistent template system
- No scheduled exports/reports or delivery tracking
- Large exports can block UI or fail without progress/retry UX
- Permission/audit controls for exported data are unclear

## Proposed Solution

Create a **Data Export & Reporting Center**:
- Unified UI for ad-hoc exports, report generation, templates, and schedules
- Background job model with progress, retry, download, and delivery status
- Multiple formats (CSV, JSON, JSONL, PDF) with configurable fields/filters
- Scheduled reports with recipients/channels (email/webhook/download)

## Requirements

### Functional
- [ ] Export builder: select entity (runs/crashes/campaigns/metrics), filters, columns, format
- [ ] Report templates: create/edit/version/apply templates with branding/options
- [ ] Scheduled exports/reports: cron/timezone, recipients, channels, retention
- [ ] Background job tracking: queued/running/completed/failed with progress and logs
- [ ] Delivery tracking: download links, email/webhook delivery status, retries
- [ ] Export history with re-run and clone actions
- [ ] Permission-aware access and redaction options for sensitive fields

### Non-Functional
- [ ] Large exports streamed/chunked without blocking UI
- [ ] Secure download links with expiration
- [ ] Auditable export/report actions
- [ ] Performance: generate 100k-row CSV without timeout (async)

## Files to Modify / Create
```
apps/web/src/features/reporting/export-center/
├── ExportCenter.tsx
├── ExportBuilder.tsx
├── ReportTemplates.tsx
├── ScheduleManager.tsx
├── JobHistory.tsx
├── DeliveryStatus.tsx
└── hooks/useExportJobs.ts

apps/web/src/app/api/exports/
├── route.ts
├── jobs/route.ts
├── schedules/route.ts
└── templates/route.ts

apps/web/src/app/report-generator* (migrate/consolidate)
apps/web/src/app/export-run-csv-utils.ts (integrate)
```

## Acceptance Criteria
- Users can create, schedule, track, and download exports/reports from one place
- Background jobs handle large exports with progress and retries
- Templates and schedules are reusable and permission-aware
- Delivery/audit tracking available for all exports

## PR Guide
- Branch: `issue/043-frontend-export-reporting-center`
- Phase 1: Export builder + async jobs + history
- Phase 2: Templates + multi-format generation
- Phase 3: Scheduling + delivery tracking
- Phase 4: Permissions/redaction + tests

**Estimated effort:** 4-5 weeks (200 pts)