---
name: "Frontend: Heatmap Calendar - Interactive Time-Series Visualization with Drill-Down, Annotations & Export"
description: "Build a GitHub-contributions-style heatmap calendar for run activity with multi-metric layers, drill-down to run lists, annotation overlays, and high-performance Canvas/WebGL rendering"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current `heatmap-calendar` directory exists but is minimal. Need production-grade heatmap:
- Only shows run count (single metric)
- No drill-down (click → run list)
- No annotations (deployments, incidents, config changes)
- SVG rendering → poor performance > 2 years data
- No export / sharing

## Current State

- `apps/web/src/app/heatmap-calendar/` — basic component
- No multi-metric, no annotations, no WebGL

## Proposed Solution

**Multi-Layer Heatmap Calendar** with Canvas/WebGL rendering:

```
┌─────────────────────────────────────────────────────────────────┐
│  2024                                    [Metric ▼] [Year ▼]    │
│  ┌──┬──┬──┬──┬──┬──┬──┐  Jan  │  ████ ████ ████ ░░░░ ░░░░     │
│  │██│██│██│██│██│██│██│  Feb  │  ████ ████ ████ ████ ████     │
│  │██│██│██│██│██│██│██│  Mar  │  ████ ████ ░░░░ ░░░░ ░░░░     │
│  │██│██│██│██│██│██│██│  Apr  │  ████ ████ ████ ████ ████     │
│  │██│██│██│██│██│██│██│  May  │  ████ ░░░░ ░░░░ ░░░░ ░░░░     │
│  │██│██│██│██│██│██│██│  Jun  │  ░░░░ ░░░░ ░░░░ ░░░░ ░░░░     │
│  │██│██│██│██│██│██│██│       │                                   │
│  └──┴──┴──┴──┴──┴──┴──┘  Less  ──────────────────────  More    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Metric Layers:  ☑ Runs  ☑ Crashes  ☐ Gas Used  ☐ Duration │  │
│  │  Annotations:    🚀 Deploy v2.1  ⚠️ Incident #42  📝 Config │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [Drill-down: Jan 15 — 47 runs, 12 crashes]  [Export PNG/CSV]   │
└─────────────────────────────────────────────────────────────────┘
```

**Rendering**: Canvas 2D for < 5 years; WebGL (via `luma.gl` or `deck.gl`) for > 5 years / 100k+ cells

## Requirements

### Functional

- [ ] **Multi-metric layers**: Toggle runs / crashes / gas used / duration / unique errors
- [ ] **Color scales**: Sequential (viridis), diverging (RdBu), categorical; customizable
- [ ] **Time granularity**: Day (default), week, month; zoom via wheel/pinch
- [ ] **Drill-down**: Click cell → side panel with run list (virtualized, filtered to that day)
- [ ] **Annotations**: Overlay markers for deployments, incidents, config changes, manual notes
- [ ] **Annotation API**: POST `/api/annotations` → appears on all team heatmaps
- [ ] **Range selection**: Drag-select date range → filter dashboard / export
- [ ] **Comparison mode**: Overlay two campaigns (different opacity/pattern)
- [ ] **Export**: PNG (high-DPI), CSV (date, metric, value), shareable URL

### Non-Functional

- [ ] Render 10 years (3650 cells) < 100ms (Canvas) / < 50ms (WebGL)
- [ ] Smooth zoom/pan at 60fps
- [ ] Memory < 50MB for 10 years multi-metric
- [ ] Bundle size < 30KB gzip (Canvas) / < 80KB (WebGL, lazy-loaded)
- [ ] Accessible: Keyboard nav (arrow keys), screen reader reads cell values, high-contrast mode

## Files to Modify / Create

```
apps/web/src/features/analytics/heatmap/
├── HeatmapCalendar.tsx                 # Main component
├── HeatmapCalendar.test.tsx
├── rendering/
│   ├── CanvasRenderer.ts               # Canvas 2D implementation
│   ├── WebGLRenderer.ts                # WebGL (deck.gl/luma.gl) implementation
│   ├── rendererFactory.ts              # Auto-select based on data size
│   ├── colorScales.ts                  # D3-scale-chromatic + custom
│   └── shaders/                        # WebGL shaders (if WebGL)
│       ├── heatmap.vert
│       └── heatmap.frag
├── interaction/
│   ├── DrillDownPanel.tsx              # Side panel with run list
│   ├── RangeSelector.ts                # Drag-select logic
│   ├── Tooltip.ts                      # Hover tooltip with details
│   └── KeyboardNavigator.ts            # Arrow key navigation
├── annotations/
│   ├── AnnotationLayer.ts              # Renders markers on calendar
│   ├── AnnotationAPI.ts                # CRUD + real-time via SSE (#002)
│   ├── AnnotationMarker.tsx            # Deploy/incident/note icons
│   └── useAnnotations.ts
├── data/
│   ├── HeatmapDataProvider.ts          # Fetches + aggregates (API + cache)
│   ├── AggregationEngine.ts            # Day/week/month rollups
│   ├── ComparisonEngine.ts             # Dual-campaign overlay
│   └── useHeatmapData.ts
├── export/
│   ├── PNGExporter.ts                  # High-DPI canvas capture
│   ├── CSVExporter.ts
│   └── ShareURLGenerator.ts
└── hooks/
    ├── useHeatmapCalendar.ts           # Main state
    ├── useHeatmapRenderer.ts           # Renderer lifecycle
    └── useHeatmapInteraction.ts        # Click/hover/keyboard
```

**API Routes** (new):
```
apps/web/src/app/api/heatmap/
├── data/route.ts                       # GET ?metric=X&granularity=day&from=Y&to=Z
├── annotations/route.ts                # CRUD for annotations
└── export/route.ts                     # Server-side PNG generation (optional)
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Render 5 years, 4 metrics | < 100ms | Benchmark |
| Drill-down open | < 200ms | E2E |
| Annotation real-time appear | < 500ms | E2E (SSE) |
| Export PNG (4K) | < 1s | E2E |
| Keyboard nav (arrow keys) | Full coverage | Axe + manual |
| Comparison mode toggle | < 50ms | Benchmark |

## PR Guide

- Branch: `issue/007-heatmap-calendar-interactive`
- Phase 1: Canvas renderer + basic heatmap + drill-down
- Phase 2: Multi-metric layers + color scales + annotations
- Phase 3: WebGL renderer (optional, for large datasets)
- Phase 4: Export + comparison mode + sharing
- **Dependencies**: `d3-scale-chromatic`, `deck.gl` or `luma.gl` (lazy), `date-fns`
- Update `docs/ARCHITECTURE.md` with heatmap architecture

## Related Issues

- Depends on: #002 (SSE for real-time annotations), #005 (filters for drill-down)
- Blocks: #018 (scheduled alerts from heatmap patterns)
- Related: `apps/web/src/app/heatmap-calendar/` (legacy — replace)

## Contributor Notes

**Start here if:** You have experience with:
- Canvas 2D / WebGL rendering for data viz
- D3 scales and color theory
- Large dataset visualization optimization
- Keyboard-accessible data visualizations

**Key challenges:**
- WebGL vs Canvas tradeoff: When to switch?
- Color blindness safe palettes (viridis, cividis)
- Annotation positioning: Pixel-perfect on zoom/pan
- Drill-down performance: Virtualized list inside portal

**Learning resources:**
- Canvas heatmap: https://github.com/d3/d3-heatmap (archived but good reference)
- deck.gl heatmap: https://deck.gl/docs/layers/heatmap-layer
- Color scales: https://github.com/d3/d3-scale-chromatic

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes