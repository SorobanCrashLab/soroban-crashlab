---
name: "Frontend: Multi-Workspace & Project Switching UX - Tenant Context, Scoped Navigation, and Cross-Workspace Safety"
description: "Implement a robust multi-workspace/project experience with fast context switching, scoped data/views, safe cross-workspace navigation, and clear tenant boundaries in the UI"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Teams operating multiple projects, networks, or customer environments need strong workspace isolation and fast switching. Current UX assumes a mostly single-context flow, which creates risk and friction:
- No first-class workspace/project selector and scoped navigation context
- URLs, saved views, notifications, and recent items can leak or confuse context
- Background requests/cache may mix data across tenants in edge cases
- Users lack visibility into which environment (prod/test/local, chain/network, org) they are operating in
- Admin/on-call workflows require rapid, safe switching during incidents

## Proposed Solution

Deliver a **Multi-Workspace Context System**:
- Global workspace/project switcher with recent workspaces, search, and status indicators
- Workspace-scoped routing, data fetching keys, caches, and persisted UI state
- Context banners/indicators (network, environment, permissions) and destructive-action safeguards
- Cross-workspace deep-link handling with explicit confirmation when switching context
- Per-workspace defaults (views, filters, integrations, notification prefs) and quick return navigation

## Requirements

### Functional
- [ ] Workspace/project model in UI state with selector (header/command palette) and recent/favorites
- [ ] Scoped routes and URL strategy (`/w/:workspace/...` or canonical equivalent) with safe redirects (#056)
- [ ] Workspace context provider that namespaces query caches, local storage keys, subscriptions, and uploads (#055/#002)
- [ ] Visual context indicators: workspace name, environment/network badge, role/capabilities summary
- [ ] Cross-workspace link/open behavior: prompt, confirm, or read-only preview to prevent accidental actions
- [ ] Per-workspace saved views, notification filters, and "last visited" restoration (#052/#041)
- [ ] Admin UX for workspace metadata and membership visibility (read/manage as permitted) (#022/#042)
- [ ] Audit events for workspace switches in sensitive contexts where required (#063)

### Non-Functional
- [ ] Context switch <500ms perceived with prefetching; no cross-tenant data flash
- [ ] Strict cache/storage isolation to prevent data leakage between workspaces
- [ ] Resilient behavior on revoked access/membership changes (graceful fallback)
- [ ] Accessible switcher and dialogs (keyboard, screen reader, focus trapping)
- [ ] E2E coverage for isolation, deep links, and permission edge cases

## Files to Modify / Create
```
apps/web/src/features/workspaces/
├── WorkspaceProvider.tsx
├── WorkspaceSwitcher.tsx
├── WorkspaceContextBanner.tsx
├── guards/
│   └── WorkspaceGuard.tsx
└── hooks/useWorkspace.ts

apps/web/src/lib/workspaces/
├── context.ts
├── storageKeys.ts
└── routing.ts

apps/web/src/app/w/[workspaceId]/layout.tsx
apps/web/src/app/api/workspaces/route.ts
apps/web/src/app/api/workspaces/[id]/route.ts
docs/frontend/multi-workspace-ux.md
```

## Acceptance Criteria
- Users can switch workspaces quickly with clear context and no data leakage
- URLs/deep links/saved state resolve to correct workspace scope or safe prompts
- Caches/subscriptions/storage are isolated per workspace
- Permission loss and cross-workspace navigation handled safely and accessibly

## PR Guide
- Branch: `issue/071-frontend-multi-workspace-project-switching`
- Phase 1: workspace context model + routing/layout + switcher UI
- Phase 2: cache/storage/subscription scoping and indicators
- Phase 3: deep-link safety, per-workspace defaults, admin/membership UX
- Phase 4: isolation/security tests, a11y, docs
- Coordinate with #022/#055/#056/#042/#063; enforce tenant isolation as a release blocker

**Estimated effort:** 6-8 weeks (200 pts)
