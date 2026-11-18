---
name: "Frontend: Saved Views & Shareable Workspace Links - Cross-Page View Persistence, Team Sharing & Governance"
description: "Implement a unified saved views system for lists/dashboards/filters with shareable links, team visibility controls, versioning, and default view management"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Users repeatedly rebuild the same filters/layouts across runs, campaigns, analytics, and triage. Existing saved filter presets and dashboard layout utils are fragmented and local-only.

Issues:
- No unified saved view model across pages (filters + sort + columns + layout + time range)
- Cannot share views with teammates or set team/workspace defaults
- No version history or ownership/permissions for shared views
- URLs are not consistently canonical/shareable for complex view state
- No discovery/manage UI for saved views

## Proposed Solution

Build a **Saved Views Platform**:
- Canonical view schema capturing query, layout, columns, visualization settings
- Save/load/duplicate/rename/delete with personal/team/workspace scopes
- Shareable deep links and default view per page/context
- Version history, ownership transfer, and governance controls
- Unified "Views" menu and management page

## Requirements

### Functional
- [ ] Unified saved view schema for runs, campaigns, crashes, dashboards, analytics pages
- [ ] Save current view with name/description/tags/scope (private, team, workspace)
- [ ] Shareable URL generation and copy; open link restores exact view state
- [ ] Set personal/team default view per page; fallback behavior defined
- [ ] Version history on edits with restore previous version
- [ ] Manage views UI: search, filter, pin/favorite, duplicate, archive/delete
- [ ] Permission-aware sharing/editing (RBAC/ABAC #022) and ownership transfer
- [ ] Migration path from existing local presets/layout storage

### Non-Functional
- [ ] View restore < 500ms after data load; no state flicker
- [ ] URL encoding robust for complex state (size-safe compression where needed)
- [ ] Backward-compatible schema evolution with migrations
- [ ] Full keyboard/a11y support for view menus and dialogs

## Files to Modify / Create
```
apps/web/src/features/saved-views/
├── SavedViewsProvider.tsx
├── viewSchema.ts
├── urlCodec.ts
├── SaveViewDialog.tsx
├── ViewsMenu.tsx
├── ManageViewsPage.tsx
├── versioning.ts
└── hooks/
    ├── useSavedViews.ts
    └── useViewSync.ts

apps/web/src/app/api/saved-views/
├── route.ts
├── [id]/route.ts
└── [id]/versions/route.ts

apps/web/src/app/saved-views/ (enhance)
apps/web/src/app/saved-filter-presets-utils.ts (migrate)
apps/web/src/app/dashboard-layout-utils.ts (integrate)
```

## Acceptance Criteria
- Users can save, share, version, and restore complex views across core pages
- Team/workspace views governed by permissions with auditability
- Links restore identical state; defaults apply predictably
- Legacy local presets migrated without data loss

## PR Guide
- Branch: `issue/052-frontend-saved-views-sharing`
- Phase 1: Schema + persistence + URL sync
- Phase 2: Save/manage/share/default UI
- Phase 3: Versioning + permissions + migration
- Phase 4: Cross-page adoption + tests/docs

**Estimated effort:** 4-5 weeks (200 pts)