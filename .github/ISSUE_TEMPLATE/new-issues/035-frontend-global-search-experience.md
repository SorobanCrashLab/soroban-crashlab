---
name: "Frontend: Global Search Experience - Unified Cross-Entity Search with Indexing, Facets, Saved Searches & Instant Results"
description: "Build a unified global search (⌘K/overlay) that searches runs, campaigns, crashes, artifacts, integrations, and docs with faceted filters, relevance ranking, previews, and saved searches"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Search is fragmented across pages (`apps/web/src/app/search/`, `fuzzy-search-utils.ts`) with inconsistent behavior:
- No unified cross-entity search (runs vs crashes vs campaigns vs artifacts)
- Limited ranking/relevance and no previews
- No facets (status, campaign, date range, error type, owner)
- No saved searches or recent search history
- Slow on large datasets and poor keyboard/accessibility experience

## Proposed Solution

Implement a **Global Search Platform**:
- Unified search index abstraction (client-side for small sets, server-backed for scale)
- Entity-aware results with grouped sections, snippets, and quick actions
- Faceted filtering, sort, and keyboard-first command/search UI integration (#004)
- Saved searches, recent history, and shareable search URLs
- Deep-link navigation with context preservation

## Requirements

### Functional
- [ ] Search across runs, campaigns, crashes/artifacts, integrations, settings/docs pages
- [ ] Facets: entity type, status, severity, campaign, date range, tags, owner/team
- [ ] Relevance ranking with typo tolerance and highlighted matches
- [ ] Result previews (crash signature, run summary, artifact metadata) without full navigation
- [ ] Saved searches (personal/team), recent searches, and shareable URLs
- [ ] Keyboard-first UX: arrow nav, enter open, ctrl/⌘+enter open in new tab/panel
- [ ] Empty/loading/error states with actionable guidance
- [ ] Permission-aware results (respect RBAC/ABAC #022)

### Non-Functional
- [ ] First results < 150ms for cached/local index; < 500ms server-backed
- [ ] Supports 100k+ indexed records without UI jank
- [ ] Accessible: ARIA combobox/listbox patterns, screen reader announcements
- [ ] Instrumented: query latency, zero-result rate, click-through tracking

## Files to Modify / Create
```
apps/web/src/features/search/
├── GlobalSearch.tsx
├── SearchDialog.tsx
├── SearchResults.tsx
├── SearchFacets.tsx
├── SearchPreviewPanel.tsx
├── SavedSearches.tsx
├── providers/
│   ├── SearchProvider.ts
│   ├── ClientIndexProvider.ts
│   └── ServerSearchProvider.ts
├── ranking/
│   ├── relevance.ts
│   └── highlight.ts
└── hooks/
    ├── useGlobalSearch.ts
    ├── useSavedSearches.ts
    └── useSearchAnalytics.ts

apps/web/src/app/api/search/
├── route.ts
├── suggestions/route.ts
└── saved/route.ts

apps/web/src/app/search/page.tsx (enhance)
```

## Acceptance Criteria
- Unified search returns relevant cross-entity results with facets and previews
- Saved/shared searches restore exact state
- p95 search interaction < 500ms on representative dataset
- Accessibility audit passes for search dialog and results

## PR Guide
- Branch: `issue/035-frontend-global-search`
- Phase 1: Search provider abstraction + API + basic UI
- Phase 2: Ranking/highlighting/previews + facets
- Phase 3: Saved searches/history/URL sync
- Phase 4: A11y, analytics, performance tuning

**Estimated effort:** 4-5 weeks (200 pts)