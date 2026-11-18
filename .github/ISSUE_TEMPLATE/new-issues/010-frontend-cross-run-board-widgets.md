---
name: "Frontend: Cross-Run Board - Custom Widgets, Drag-Drop Layout Persistence & Real-time Data Binding"
description: "Build a dashboard-style cross-run board with user-defined widgets, gridstack drag-drop layout, real-time data binding via SSE, and template sharing"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current `create-cross-run-board-custom-widgets-63.tsx` and `implement-cross-run-board-widgets-component.tsx` are basic:
- Fixed widget set (no custom widgets)
- No drag-drop layout persistence
- No real-time data (polling only)
- No widget marketplace / sharing
- No cross-run data binding (widget tied to single run)

## Current State

- `apps/web/src/features/runs/create-cross-run-board-custom-widgets-63.tsx`
- `implement-cross-run-board-widgets-component.tsx`
- `CrossRunBoardWidgets.md` — documentation
- `run-cluster-canvas.tsx` — related but separate

## Proposed Solution

**Extensible Cross-Run Board** with widget SDK, Gridstack layout, and live data:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cross-Run Board: "Mainnet Regression Watch"          [✏️ Edit] [💾 Save]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │ │
│  │  │ 📊 Crash Rate    │  │ 📈 Gas Trend     │  │ 🔴 Live Crashes      │  │ │
│  │  │ ████████░░ 2.3%  │  │ ████████████░░   │  │ ▸ run_abc  0:12 ago  │  │ │
│  │  │ ▼ 0.1% vs 24h    │  │ ▲ 12% vs 24h     │  │ ▸ run_def  0:45 ago  │  │ │
│  │  │ [Runs: 50]       │  │ [Runs: 50]       │  │ [Auto-refresh: 5s]   │  │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ 📋 Top Errors (Last 100 Runs)                    [🔍 Filter]      │  │ │
│  │  │  1. Reentrancy          ████████████████░░  47  (47%)  ▲ +3%     │  │ │
│  │  │  2. Integer Overflow    ██████████░░░░░░░░  23  (23%)  ▼ -1%     │  │ │
│  │  │  3. Access Violation    ████████░░░░░░░░░░  18  (18%)  —        │  │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  [+ Add Widget]  [📦 Widget Library]  [🔗 Share Board]  [📤 Export JSON]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Widget SDK**: `registerWidget({ id, name, description, schema, dataQuery, render })`
- [ ] **Built-in widgets**: Crash rate, Gas trend, Error breakdown, Cluster map, Replay sync, Custom query
- [ ] **Gridstack layout**: Drag-drop, resize, responsive breakpoints, persist to localStorage + DB
- [ ] **Real-time data**: SSE (#002) → widgets auto-update without refresh
- [ ] **Cross-run binding**: Widget queries multiple runs (campaign, tag, time range)
- [ ] **Widget parameters**: Each instance configurable (time range, filters, display options)
- [ ] **Template library**: Save board as template; share via URL; import/export JSON
- [ ] **Widget marketplace**: Community widgets (reviewed, versioned, installable)
- [ ] **Dashboard mode**: Full-screen, kiosk, auto-rotate boards

### Non-Functional

- [ ] 20 widgets + real-time → 60fps, < 100MB
- [ ] Widget sandbox: Iframe or Web Worker for untrusted custom widgets
- [ ] Layout save < 500ms
- [ ] Bundle: Core < 50KB, widgets code-split
- [ ] Accessible: Keyboard grid nav, screen reader widget summaries

## Files to Modify / Create

```
apps/web/src/features/runs/cross-run-board/
├── CrossRunBoard.tsx                   # Main board with Gridstack
├── CrossRunBoard.test.tsx
├── sdk/
│   ├── WidgetRegistry.ts               # Central widget store
│   ├── WidgetSDK.ts                    # registerWidget, useWidgetData, etc.
│   ├── WidgetSchema.ts                 # Zod schema for widget config
│   ├── BuiltinWidgets.ts               # Core widgets
│   └── types.ts                        # WidgetData, WidgetConfig, WidgetRender
├── layout/
│   ├── GridstackLayout.tsx             # Gridstack wrapper + persistence
│   ├── LayoutPersistence.ts            # localStorage + API sync
│   ├── ResponsiveBreakpoints.ts
│   └── useBoardLayout.ts
├── widgets/
│   ├── CrashRateWidget.tsx
│   ├── GasTrendWidget.tsx
│   ├── ErrorBreakdownWidget.tsx
│   ├── ClusterMapWidget.tsx
│   ├── ReplaySyncWidget.tsx
│   ├── CustomQueryWidget.tsx           # User writes query
│   └── WidgetChrome.tsx                # Header, refresh, settings, remove
├── data/
│   ├── WidgetDataProvider.ts           # SSE + Query execution
│   ├── QueryExecutor.ts                # Safe query evaluation
│   ├── CacheManager.ts                 # SWR/React Query integration
│   └── useWidgetData.ts
├── templates/
│   ├── BoardTemplateManager.ts         # Save/load/share templates
│   ├── TemplateLibrary.tsx             # Browse/install templates
│   └── TemplateSharing.ts              # URL + JSON import/export
├── marketplace/
│   ├── MarketplaceClient.ts            # Fetch community widgets
│   ├── WidgetInstaller.ts              # Sandbox + install
│   └── MarketplaceBrowser.tsx
└── hooks/
    ├── useCrossRunBoard.ts             # Main state
    ├── useWidgetRegistry.ts
    └── useBoardLayout.ts
```

**API** (new):
```
apps/web/src/app/api/boards/
├── route.ts                            # CRUD boards
├── templates/route.ts                  # Template CRUD + sharing
├── widgets/route.ts                    # Marketplace widget catalog
└── layout/route.ts                     # Persist layout per user/board
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| 20 widgets live update | 60fps | Benchmark |
| Drag-drop layout persist | < 500ms | E2E |
| Custom widget sandbox | Isolated | Security test |
| Template share URL | Loads identical | E2E |
| Widget parameter change | < 200ms data refresh | E2E |
| Marketplace install | < 5s | E2E |

## PR Guide

- Branch: `issue/010-cross-run-board-widgets`
- Phase 1: Widget SDK + Gridstack layout + built-in widgets
- Phase 2: Real-time data binding + cross-run queries
- Phase 3: Templates + sharing + persistence
- Phase 4: Marketplace + sandbox + dashboard mode
- **Dependencies**: `gridstack`, `react-grid-layout` (alternative), `zod`
- Update `docs/ARCHITECTURE.md` with cross-run board architecture

## Related Issues

- Depends on: #002 (SSE for real-time), #005 (filters for widget queries)
- Blocks: #018 (scheduled board snapshots)
- Related: `create-cross-run-board-custom-widgets-63.tsx` (legacy — replace)

## Contributor Notes

**Start here if:** You have experience with:
- Gridstack / react-grid-layout for dashboard layouts
- Plugin/extension SDK design
- Real-time data binding (SWR, React Query, SSE)
- Sandboxing untrusted code (iframe, Web Worker, SES)

**Key challenges:**
- Widget sandbox: Iframe (secure, heavy) vs Worker (light, limited DOM)
- Query safety: User-written queries → validate, timeout, resource limits
- Layout persistence: Conflict resolution (multiple tabs)
- Marketplace: Versioning, dependencies, security review

**Learning resources:**
- Gridstack: https://gridstackjs.com/
- ObservableHQ widget model: https://observablehq.com/@observablehq/widget
- VS Code extension API: https://code.visualstudio.com/api

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes