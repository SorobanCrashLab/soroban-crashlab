---
name: "Frontend: Advanced Data Grid Engine - Pivoting, Aggregations, Column Formulas, and High-Scale Tabular Analysis"
description: "Deliver a next-generation data grid for CrashLab entities with pivot/grouping, aggregations, computed columns, conditional formatting, and million-row-capable interaction patterns"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Tabular analysis is central to triage and operations, but current tables are limited for exploratory analysis:
- No pivot/group-by/aggregation workflows across runs, crashes, clusters, and CI data
- Users cannot define computed columns/formulas or reusable analytical views
- Large datasets need virtualization and server-assisted querying to remain usable
- Consistent grid behaviors (selection, export, saved views) vary across surfaces

## Proposed Solution
Implement an **Advanced Data Grid Engine** as a shared platform capability:
- Virtualized grid core with grouping, pivoting, aggregations, and column formulas
- Rich cell renderers for entities (status, sparklines, links, badges) and conditional formatting
- Server-driven query model integration for sorting/filtering/aggregation at scale
- Saved views, exports, and embedding in dashboards and analysis pages

## Requirements
### Functional
- [ ] Group-by, pivot, subtotals/grand totals, and aggregation functions (count, uniq, p50/p95, rate)
- [ ] Computed columns/formulas with validation, references, and formatted outputs
- [ ] Column management: pin/reorder/resize/show-hide, multi-sort, conditional formatting rules
- [ ] Entity-aware cells and drill-down actions to runs/traces/issues/incidents (#036/#068/#062/#066)
- [ ] Row selection and integration with bulk actions/workflows (#051/#049)
- [ ] Saved grid views, share links, snapshots, and exports (CSV/JSON) (#052/#056/#043)
- [ ] Server-side query adapter for large datasets with pagination/windowing and stable cursors

### Non-Functional
- [ ] Smooth scrolling/interaction on 100k+ rows (virtualization, memoization)
- [ ] Deterministic query/view serialization and reproducible exports
- [ ] Accessible grid semantics, keyboard navigation, and screen-reader support (#038/#094)
- [ ] Permission-aware column/cell redaction and action gating (#070)

## Files to Modify / Create
```
apps/web/src/components/data-grid/
├── DataGridEngine.tsx
├── pivot/
├── formulas/
├── aggregations/
├── renderers/
└── hooks/useDataGrid.ts

apps/web/src/lib/data-grid/
├── queryModel.ts
├── serializer.ts
└── adapters/

docs/frontend/advanced-data-grid-engine.md
```

## Acceptance Criteria
- Shared grid enables pivot/aggregation/formula workflows across key entity tables
- Large datasets remain performant with correct server/client coordination
- Views are saveable/shareable/exportable and accessible

## PR Guide
- Branch: `issue/111-frontend-advanced-data-grid-engine`
- Phase 1: grid core + virtualization + column/group primitives
- Phase 2: pivot/aggregations/formulas + server adapter
- Phase 3: saved views/exports/entity integrations
- Phase 4: a11y/perf/permissions tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
