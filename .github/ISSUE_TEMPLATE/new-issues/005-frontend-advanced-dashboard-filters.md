---
name: "Frontend: Advanced Dashboard Filters - Composable Query Builder with Saved Views, URL State & Real-time Results"
description: "Replace basic filter dropdowns with a powerful, composable query builder supporting nested AND/OR groups, saved views with sharing, URL synchronization, and sub-100ms filter application on 100k+ rows"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current filtering (`apps/web/src/app/create-advanced-dashboard-filters-page.tsx`) is limited:
- Flat filter list (no nested AND/OR logic)
- No saved views / shareable filter URLs
- Filter state not in URL (can't bookmark/share filtered view)
- Slow on large datasets (client-side only, no virtualization integration)
- No filter suggestions / autocomplete from data

## Current State

- `create-advanced-dashboard-filters-page.tsx` — basic implementation
- `run-filter-utils.ts` — filter logic
- `saved-filter-presets-utils.ts` — simple presets only
- URL state: `url-state-codec.ts` — basic codec, not filter-aware

## Proposed Solution

**Composable Query Builder** with visual query tree, URL sync, and server-side execution option:

```
┌─────────────────────────────────────────────────────────────────┐
│  Query Builder                                    [Save View]   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AND                                                        │  │
│  │  ├── status = crashed                                       │  │
│  │  ├── campaign ∈ {mainnet-fuzz, testnet-regression}        │  │
│  │  ├── OR                                                     │  │
│  │  │   ├── error.type = "Reentrancy"                         │  │
│  │  │   └── error.type = "IntegerOverflow"                    │  │
│  │  └── gas_used > 500000                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [+ Add Condition]  [+ Add Group]  [Clear]  [🔗 Share URL]     │
│  Results: 1,247 / 50,000 runs (2.5%)  ⚡ 47ms                   │
└─────────────────────────────────────────────────────────────────┘
```

**Architecture**: AST-based filter representation → URL codec → Server-side (PostgreSQL/Redis) or client-side (Web Worker) execution

## Requirements

### Functional

- [ ] **Visual query tree**: Drag-drop to reorder, nest AND/OR groups, duplicate, delete
- [ ] **Field autocomplete**: Type-ahead for field names (from schema), operators, values
- [ ] **Value suggestions**: For enums (status, campaign), show distinct values from data
- [ ] **URL synchronization**: Filter state ↔ URL (compressed, shareable, bookmarkable)
- [ ] **Saved views**: Name, description, visibility (private/team/public), share via link
- [ ] **View versioning**: Edit → save as new version; revert to previous
- [ ] **Real-time count**: "1,247 / 50,000 matches" updates as you type (debounced 300ms)
- [ ] **Server-side execution**: Option to push filter to API for 100k+ rows (returns count + first page)
- [ ] **Client-side fallback**: Web Worker for < 50k rows (integrates with #001 virtualized table)
- [ ] **Export**: Copy filter as JSON, SQL WHERE clause, or cURL command

### Non-Functional

- [ ] Filter apply (client, 50k) < 100ms (Web Worker)
- [ ] Filter apply (server, 1M) < 500ms (indexed query)
- [ ] URL length < 2000 chars (compressed with lz-string)
- [ ] Zero layout shift when results update
- [ ] Accessible: Keyboard nav tree, ARIA tree role, screen reader announcements

## Files to Modify / Create

```
apps/web/src/features/analytics/create-advanced-dashboard-filters-page.tsx  →  REFACTOR

apps/web/src/features/dashboard/filters/
├── QueryBuilder.tsx                    # Main visual tree editor
├── QueryBuilder.test.tsx
├── ast/
│   ├── FilterAST.ts                    # Types: Condition, Group (AND/OR), Not
│   ├── FilterAST.test.ts
│   ├── builders.ts                     # Fluent API: filter().where().or().group()
│   └── visitors.ts                     # Visitors: toSQL, toURL, toMongo, evaluate
├── ui/
│   ├── ConditionRow.tsx                # Single condition: field, operator, value
│   ├── GroupRow.tsx                    # AND/OR group with children
│   ├── FieldAutocomplete.tsx           # Field picker with schema
│   ├── ValueAutocomplete.tsx           # Value suggestions from data
│   ├── OperatorSelect.tsx              # Operator dropdown (context-aware)
│   └── DragDropHandlers.ts             # dnd-kit for tree reordering
├── execution/
│   ├── ClientFilterExecutor.ts         # Web Worker evaluation
│   ├── ServerFilterExecutor.ts         # API call for server-side
│   ├── executorFactory.ts              # Auto-select based on row count
│   └── CountEstimator.ts               # Fast approximate count
├── persistence/
│   ├── SavedViewStore.ts               # IndexedDB + API sync
│   ├── SavedViewAPI.ts                 # CRUD endpoints
│   └── ViewSharing.ts                  # Share links, permissions
├── url/
│   ├── FilterURLCodec.ts               # AST ↔ compressed URL
│   ├── FilterURLCodec.test.ts
│   └── compression.ts                  # lz-string + base64url
└── hooks/
    ├── useQueryBuilder.ts              # Main state + actions
    ├── useFilterExecution.ts           # Execute + loading + results
    ├── useSavedViews.ts                # CRUD + sharing
    └── useFilterURLSync.ts             # URL ↔ state sync
```

**API Routes** (new):
```
apps/web/src/app/api/filters/
├── execute/route.ts                    # POST {ast, limit} → {count, runs[]}
├── count/route.ts                      # POST {ast} → {count}
├── saved-views/route.ts                # CRUD for saved views
└── suggestions/route.ts                # GET ?field=X → distinct values
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Build 5-level nested filter | < 30s | E2E: Playwright |
| Apply filter (50k client) | < 100ms | Benchmark |
| Apply filter (1M server) | < 500ms | Load test |
| Share URL → open in new tab | Identical state | E2E |
| Save view → team member loads | < 2s | E2E |
| URL length (complex filter) | < 2000 chars | Unit |
| Accessibility (axe) | 0 violations | CI |

## PR Guide

- Branch: `issue/005-advanced-dashboard-filters`
- Phase 1: AST + URL codec + basic UI (client-only)
- Phase 2: Visual query tree + drag-drop + autocomplete
- Phase 3: Server-side execution + count estimation
- Phase 4: Saved views + sharing + versioning
- **Dependencies**: `dnd-kit`, `lz-string`, `@tanstack/react-query` (existing)
- Update `docs/ARCHITECTURE.md` with filter architecture

## Related Issues

- Depends on: #001 (virtualized table integration), #004 (command palette for filter actions)
- Blocks: #010 (cross-run comparison filters), #018 (scheduled filter alerts)
- Related: `run-filter-utils.ts` (legacy — migrate)

## Contributor Notes

**Start here if:** You have experience with:
- AST/visitor patterns for query languages
- Drag-and-drop trees (dnd-kit, react-beautiful-dnd)
- URL state management (compression, serialization)
- Web Workers for client-side computation
- PostgreSQL query building / ORM (for server-side)

**Key challenges:**
- AST design: Extensible for new field types, operators
- URL compression: Balance size vs. decode speed
- Server-side: SQL injection prevention, query optimization
- Real-time count: Debounce + cancel previous requests

**Learning resources:**
- dnd-kit tree: https://docs.dndkit.com/guides/tree-view
- lz-string: https://github.com/pieroxy/lz-string
- Query builder patterns: https://github.com/ukrbublik/react-querybuilder

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes