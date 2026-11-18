---
name: "Frontend: Bulk Operations Framework - Multi-Select Actions, Background Jobs, Progress Tracking & Undo"
description: "Implement a unified bulk operations system across runs, campaigns, crashes, and artifacts with multi-select UX, queued background execution, progress/rollback, and audit-safe confirmations"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Users cannot efficiently operate on many entities at once. Current runs bulk-actions utilities (`runs-bulk-actions-utils.ts`, `add-bulk-actions-for-runs.tsx`) are limited and not generalized:
- No consistent multi-select pattern across tables/grids (runs, crashes, campaigns, artifacts, webhooks)
- Long-running bulk actions block UI or fail partially with no visibility
- No confirmation previews, dry-run, or undo/rollback for reversible actions
- No permission-aware action gating per selected item
- No audit trail linking bulk operation to affected entities

## Proposed Solution

Build a **Bulk Operations Platform**:
- Reusable selection model (page/all-filtered/manual) with count/preview
- Action registry per entity type with capability checks and preflight validation
- Background job execution for large batches with progress, partial failure handling, retry
- Undo/compensation for reversible actions and detailed result reports
- Unified UI: bulk action bar, confirmation modal, job drawer, audit links

## Requirements

### Functional
- [ ] Generic multi-select state for tables/lists/cards with "select page/all filtered" semantics
- [ ] Bulk action registry: tag, assign, export, delete/archive, retry, re-run, link issue, change status (entity-specific)
- [ ] Preflight checks: permissions, eligibility, conflicts, estimated impact/count
- [ ] Confirmation UX with dry-run preview and required reason for destructive actions
- [ ] Background job execution for >N items with progress, cancellation, per-item results
- [ ] Partial failure handling: downloadable error report, retry failed-only
- [ ] Undo/rollback support for reversible actions within retention window
- [ ] Audit events emitted per bulk operation and per affected entity

### Non-Functional
- [ ] Selection/actions performant on 10k+ row virtualized tables (#001)
- [ ] No UI freeze during batch submission; progress updates via SSE/polling
- [ ] Idempotent action execution to prevent duplicate side effects
- [ ] Accessible: keyboard selection, screen reader announcements for counts/progress

## Files to Modify / Create
```
apps/web/src/features/bulk-actions/
├── BulkActionsProvider.tsx
├── SelectionManager.ts
├── ActionRegistry.ts
├── BulkActionBar.tsx
├── BulkConfirmDialog.tsx
├── BulkJobDrawer.tsx
├── preflight/
│   ├── validators.ts
│   └── permissionChecks.ts
├── jobs/
│   ├── BulkJobClient.ts
│   └── resultReport.ts
└── hooks/
    ├── useSelection.ts
    └── useBulkActions.ts

apps/web/src/app/api/bulk-jobs/
├── route.ts
├── [id]/route.ts
└── [id]/retry/route.ts

apps/web/src/app/runs-bulk-actions-utils.ts (migrate)
apps/web/src/features/runs/add-bulk-actions-for-runs.tsx (migrate)
```

## Acceptance Criteria
- Consistent bulk selection/actions available on runs, campaigns, crashes, artifacts
- Large batches run asynchronously with progress and partial-failure recovery
- Destructive actions require confirmation/preflight and are audited
- Reversible actions support undo within policy window

## PR Guide
- Branch: `issue/051-frontend-bulk-operations-framework`
- Phase 1: Selection model + action registry + UI bar/confirm
- Phase 2: Background jobs API + progress/result reporting
- Phase 3: Undo/rollback + retry-failed + audit integration
- Phase 4: Migrate entity surfaces + tests/docs

**Estimated effort:** 4-5 weeks (200 pts)