---
name: "Frontend: Deep Linking & URL State Framework - Canonical Shareable State, Serialization, and Cross-Page Navigation"
description: "Create a robust deep-linking and URL state framework for filters, views, selections, and panel states with canonical serialization, validation, and backward-compatible migrations"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Many views rely on implicit/local state (filters, tabs, selected entities, layouts) making URLs non-shareable and navigation brittle. Existing `url-state-codec.ts` is limited and not consistently adopted.

Issues:
- Cannot reliably share/bookmark exact UI state (run detail panel, filters, comparison selection)
- Browser back/forward behavior inconsistent across pages
- URL params untyped/unvalidated; risk of runtime errors and invalid states
- No versioning/migration for evolving URL schemas

## Proposed Solution

Implement a **Canonical URL State Framework**:
- Typed schema definitions per route/view (Zod) with encode/decode helpers
- Versioned URL state envelopes with migration support
- Hooks/utilities for syncing React state <-> URL with debounce and defaults
- Integration with saved views (#052), filters (#005), comparison (#006), and run workspace (#036)

## Requirements

### Functional
- [ ] Typed URL state schemas for key routes: runs list, run detail/workspace, campaigns, analytics, search, integrations
- [ ] Encode/decode utilities with compression for large state and safe fallback to defaults
- [ ] Versioned state format (`v=1`) and migration registry for backward compatibility
- [ ] `useUrlState`/`useRouteViewState` hooks with parsing, validation, and replace/push control
- [ ] Support for multi-value params, arrays, ranges, selections, and panel/layout state
- [ ] Canonicalization (sorted keys/default omission) to produce stable shareable URLs
- [ ] Error handling UX for invalid/expired links with recovery to safe defaults

### Non-Functional
- [ ] URL updates debounced to avoid history spam and render thrash
- [ ] Parse/serialize < 5ms for typical states
- [ ] 100% typed coverage for adopted routes; no unsafe `any` parsing
- [ ] Works with SSR/CSR and preserves accessibility (focus/scroll management where needed)

## Files to Modify / Create
```
apps/web/src/lib/url-state/
├── schema.ts
├── codec.ts
├── migrations.ts
├── canonicalize.ts
├── hooks.ts
└── routeSchemas/
    ├── runs.ts
    ├── runDetail.ts
    ├── campaigns.ts
    └── analytics.ts

apps/web/src/app/url-state-codec.ts (migrate/deprecate)
docs/frontend/url-state.md
```

## Acceptance Criteria
- Key pages restore full view state from URL reliably
- Invalid/legacy URLs handled gracefully with migrations or safe defaults
- Share links produced are canonical and stable
- Adoption documented and integrated with saved views/filters/workspaces

## PR Guide
- Branch: `issue/056-frontend-url-state-framework`
- Phase 1: Core codec + schema/migration infrastructure
- Phase 2: Route schemas for runs/campaigns/run detail
- Phase 3: Integrate saved views/filters/comparison
- Phase 4: Docs, tests, legacy migration

**Estimated effort:** 4-5 weeks (200 pts)