---
name: "Frontend: Run Detail Experience Overhaul - Unified Timeline, Artifacts, Logs, Triage & Replay Workspace"
description: "Redesign the run detail page into a high-performance, task-oriented workspace combining timeline, crashes, logs, artifacts, replay, and triage with deep linking and collaboration hooks"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Run detail views are fragmented across components and pages (`apps/web/src/app/runs/[id]/`, `RunStatusTimeline.tsx`, `CrashDetailDrawer.tsx`, artifact/log/replay utilities) leading to:
- Context switching between tabs/drawers with lost state
- Poor performance on runs with large logs/artifacts/crash sets
- No unified deep-linkable workspace state (selected crash, timeline position, panel layout)
- Limited triage workflow integration and collaboration affordances

## Proposed Solution

Create a **Run Investigation Workspace**:
- Resizable multi-panel layout (timeline, crash list/detail, artifacts, logs, replay, metadata)
- Deep-linkable state (URL + persisted layout) for exact investigative context
- Virtualized lists/logs and lazy-loaded panels for large runs
- Integrated triage actions, annotations, and collaboration entry points (#003, #016)

## Requirements

### Functional
- [ ] Unified workspace layout with resizable/collapsible panels and preset layouts
- [ ] Panels: overview, status timeline, crashes, logs, artifacts, replay, metadata/triage
- [ ] Deep-linkable state: selected crash/artifact/log line/replay timestamp/panel layout
- [ ] Virtualized crash/log/artifact lists for 10k+ entries
- [ ] Inline artifact preview (text/json/hex/media) with safe rendering
- [ ] Triage actions in-context: tag, assign, link issue, comment, mark duplicate
- [ ] Cross-panel sync (select crash → highlight timeline/logs/replay)
- [ ] Breadcrumbs, related runs, and "next/previous run in campaign" navigation

### Non-Functional
- [ ] Initial render < 800ms for typical run; < 2s for large run with lazy panels
- [ ] Smooth panel resize/scroll at 60fps
- [ ] No memory leaks when switching runs repeatedly
- [ ] Full keyboard navigation and screen reader support

## Files to Modify / Create
```
apps/web/src/features/runs/detail/
├── RunWorkspace.tsx
├── layout/
│   ├── WorkspaceLayout.tsx
│   ├── PanelRegistry.ts
│   └── LayoutPresets.ts
├── panels/
│   ├── OverviewPanel.tsx
│   ├── TimelinePanel.tsx
│   ├── CrashesPanel.tsx
│   ├── LogsPanel.tsx
│   ├── ArtifactsPanel.tsx
│   ├── ReplayPanel.tsx
│   └── TriagePanel.tsx
├── state/
│   ├── workspaceState.ts
│   └── urlSync.ts
└── hooks/useRunWorkspace.ts

apps/web/src/app/runs/[id]/page.tsx (refactor)
apps/web/src/components/RunStatusTimeline.tsx (integrate)
apps/web/src/app/CrashDetailDrawer.tsx (migrate/integrate)
```

## Acceptance Criteria
- Single workspace supports full investigation flow without losing context
- Deep links restore exact panel/selection/replay state
- Large runs remain responsive (virtualized lists, lazy panels)
- Triage actions available inline with audit-safe updates

## PR Guide
- Branch: `issue/036-frontend-run-detail-workspace`
- Phase 1: Layout framework + state/URL sync
- Phase 2: Core panels (overview/timeline/crashes/logs)
- Phase 3: Artifacts/replay/triage integration
- Phase 4: Performance, a11y, tests

**Estimated effort:** 5-6 weeks (200 pts)