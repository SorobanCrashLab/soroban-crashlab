---
name: "Frontend: Unified Data Table Platform - Column Management, Server-Side Ops, Virtualization & Reusable UX"
description: "Create a reusable data table platform for runs/crashes/campaigns/artifacts with server-side sorting/filtering/pagination, column customization, virtualization, and consistent interactions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Multiple table-like views exist (runs, regression suites, flaky tests, webhooks, audits) with duplicated logic for sorting, filtering, pagination, column visibility, and selection. Behavior and performance vary widely.

Issues:
- No shared table abstraction; repeated implementations and bugs
- Inconsistent server-side vs client-side operations
- Column resizing/reordering/visibility persistence missing or ad hoc
- Poor performance on large datasets without consistent virtualization
- Accessibility and keyboard navigation inconsistent (partially addressed in utils)

## Proposed Solution

Build a **Unified Data Table Platform**:
- Composable table primitives built on TanStack Table + virtualization (#001)
- Standardized server-side query model (sort/filter/page/cursor) integration
- Column management (visibility, order, resize, pinning) with persistence
- Integrated selection, bulk actions (#051), row expansion, and empty/loading/error states
- Accessible grid/table semantics and keyboard navigation

## Requirements

### Functional
- [ ] Shared table component API supporting client and server modes
- [ ] Server-side sorting, filtering, pagination/cursor integration with URL state (#056)
- [ ] Column features: show/hide, reorder, resize, pin/freeze, saved presets
- [ ] Row selection (single/multi/page/all-filtered) integrated with bulk actions (#051)
- [ ] Row expansion/details, inline actions, and contextual menus
- [ ] Consistent empty/loading/skeleton/error states and retry actions
- [ ] Sticky headers, responsive column behavior, and density modes
- [ ] Keyboard navigation and ARIA compliance for data grids

### Non-Functional
- [ ] Smooth 60fps scroll on large datasets via virtualization
- [ ] Stable rendering with memoization to avoid unnecessary re-renders
- [ ] Reusable across at least runs, crashes, campaigns, webhooks, audit logs
- [ ] Comprehensive tests for sorting/filtering/selection/persistence

## Files to Modify / Create
```
apps/web/src/components/data-table/
├── DataTable.tsx
├── DataTableToolbar.tsx
├── DataTablePagination.tsx
├── ColumnManager.tsx
├── useServerTableState.ts
├── useColumnPersistence.ts
├── rowSelection.ts
└── types.ts

apps/web/src/app/runs-table/ (migrate)
apps/web/src/app/RunHistoryTable.tsx (migrate/integrate)
apps/web/src/app/data-table-keyboard-nav-utils.ts (integrate)
docs/frontend/data-table-platform.md
```

## Acceptance Criteria
- Core entity tables migrated to shared platform with consistent UX
- Server-side operations and URL sync work reliably
- Column preferences persist and restore correctly
- Performance/a11y targets met on large datasets

## PR Guide
- Branch: `issue/058-frontend-data-table-platform`
- Phase 1: Core table primitives + server-state model
- Phase 2: Column management + persistence + selection
- Phase 3: Virtualization integration + responsive/density modes
- Phase 4: Migrate key tables + tests/docs

**Estimated effort:** 5-6 weeks (200 pts)