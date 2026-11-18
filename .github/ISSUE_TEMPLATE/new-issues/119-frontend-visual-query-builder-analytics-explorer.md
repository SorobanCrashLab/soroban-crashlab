---
name: "Frontend: Visual Query Builder & Analytics Explorer - No-Code/Low-Code Queries Across Runs, Logs, Traces, and Metrics"
description: "Build a visual query builder and analytics explorer enabling users to compose complex cross-entity queries, aggregations, and visualizations without writing raw DSL in every workflow"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Powerful querying exists in pockets (logs DSL, filters), but many users need cross-entity analysis without mastering multiple query syntaxes:
- Difficult to build complex filters/joins/aggregations across runs, crashes, traces, metrics, and CI data
- Query logic is not reusable, shareable, or easily explainable
- Transition between visual exploration and advanced DSL/code is clunky
- Incorrect queries waste time and can miss critical regressions

## Proposed Solution
Implement a **Visual Query Builder & Analytics Explorer**:
- Schema-aware visual query composer (entities, fields, operators, relations, aggregations)
- Dual mode: visual builder <-> generated DSL/query JSON/SQL-like representation
- Result explorer with table/chart views, pivots, and drill-down actions (#111/#081)
- Saved queries, parameterization, templates, and shareable analysis workflows

## Requirements
### Functional
- [ ] Visual blocks for sources, joins/relations, filters, group-by, aggregations, sort/limit, and time windows
- [ ] Schema browser with field types, descriptions, sample values, and compatibility hints
- [ ] Generate/readable underlying query representation with validation and explain/preview
- [ ] Run queries against supported datasets (runs/crashes/logs/traces/metrics/CI) with adapters (#075/#093/#059)
- [ ] Results views: grid, pivot, chart, and timeline with drill-down to entities (#111/#081/#067)
- [ ] Parameterized/saved queries, templates, sharing, and permission-aware access (#052/#056/#070)
- [ ] Query history, performance hints, and guardrails (row limits/timeouts/cost estimates)
- [ ] Export results and embed query widgets in dashboards/reports (#100/#043/#092)

### Non-Functional
- [ ] Responsive builder interactions and fast previews for common queries
- [ ] Correctness guarantees: visual/query parity and deterministic serialization
- [ ] Accessible drag/drop and keyboard-first query composition alternatives
- [ ] Secure query execution boundaries and redaction of restricted fields

## Files to Modify / Create
```
apps/web/src/features/query-builder/
├── VisualQueryBuilder.tsx
├── SchemaBrowser.tsx
├── QueryCanvas.tsx
├── QueryPreview.tsx
├── ResultExplorer.tsx
├── adapters/
└── hooks/useVisualQuery.ts

apps/web/src/app/analytics/explore/page.tsx
apps/web/src/app/api/query-builder/run/route.ts
docs/frontend/visual-query-builder-analytics-explorer.md
```

## Acceptance Criteria
- Users can compose and run complex cross-entity analyses visually with trustworthy results
- Visual and generated query representations stay in sync and are shareable/reusable
- Performance, permissions, and accessibility requirements met

## PR Guide
- Branch: `issue/119-frontend-visual-query-builder-analytics-explorer`
- Phase 1: schema/model + visual composer + query generation
- Phase 2: execution adapters + results/grid/chart explorer
- Phase 3: saved/parameterized queries + embeds/exports
- Phase 4: guardrails, a11y/perf, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
