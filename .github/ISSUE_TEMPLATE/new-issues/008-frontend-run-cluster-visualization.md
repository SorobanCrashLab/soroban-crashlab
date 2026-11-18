---
name: "Frontend: Run Cluster Visualization - Interactive Graph with Force-Directed Layout, WebGL Rendering & Real-time Updates"
description: "Replace static cluster canvas with interactive force-directed graph supporting 10k+ nodes, WebGL rendering, cluster merge/split animations, and SSE-driven live updates"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current `run-cluster-canvas.tsx` and `run-cluster-visualization-utils.ts` use Canvas 2D with basic force layout:
- Max ~2000 nodes before FPS drops
- No WebGL acceleration
- Static — no live updates as new runs arrive
- No cluster hierarchy (sub-clusters, merge/split)
- Limited interaction (pan/zoom only)

## Current State

- `apps/web/src/app/run-cluster-canvas.tsx` — Canvas 2D
- `run-cluster-visualization-utils.ts` — Force layout (d3-force)
- `run-cluster-controls.tsx` — Basic controls
- `run-cluster-legend.tsx`, `run-cluster-tooltip.tsx` — UI

## Proposed Solution

**WebGL-Accelerated Interactive Cluster Graph** with GPU force simulation:

```
┌─────────────────────────────────────────────────────────────────┐
│  Failure Clusters                          [Layout ▼] [Live 🟢] │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ●●●●●  ← Cluster A (reentrancy)     ●●  ← Cluster B      │  │
│  │   ●●●                                  ●                   │  │
│  │    ●●              🔴 NEW crash       ●●                   │  │
│  │     ●●        (enters with animation)   ●                  │  │
│  │      ●●●                              ●●●                  │  │
│  │       ●●●●                          ●●●●                   │  │
│  │                                        ●●●                 │  │
│  │  ─────────────────────────────────────────────────────    │  │
│  │  [===] Force strength    [===] Repulsion   [Center]       │  │
│  └───────────────────────────────────────────────────────────┘  │
│  Legend:  ● Crashed  ○ Running  ◐ Queued  🔴 New (pulse)       │
│  Clusters: 12  |  Nodes: 8,432  |  FPS: 59.8                   │
└─────────────────────────────────────────────────────────────────┘
```

**Architecture**: WebGL (via `pixi.js` or `three.js` + `d3-force-3d` on GPU) or `graphology` + `sigma.js`

## Requirements

### Functional

- [ ] **10,000+ nodes at 60fps**: WebGL rendering with instanced drawing
- [ ] **GPU force simulation**: `d3-force` ported to compute shaders or `graphology-forceatlas2` worker
- [ ] **Live updates**: SSE (#002) → new nodes enter with animation, clusters merge/split smoothly
- [ ] **Hierarchical clusters**: Expand/collapse cluster → show sub-clusters (recursive)
- [ ] **Cluster actions**: Merge (drag-drop), split (lasso select), rename, color
- [ ] **Time slider**: Scrub through campaign history → clusters form/evolve
- [ ] **Node detail**: Click → side panel with crash details, artifacts, replays
- [ ] **Search/filter**: "Show only reentrancy clusters" → highlight + dim others
- [ ] **Export**: PNG, SVG, GraphML, JSON (for external Gephi/GraphXR)

### Non-Functional

- [ ] 10k nodes, 50k edges → 60fps (WebGL instanced)
- [ ] Force simulation step < 16ms (60fps) for 10k nodes
- [ ] Live node add/remove < 100ms (no full relayout)
- [ ] Bundle size < 100KB gzip (WebGL renderer lazy-loaded)
- [ ] Memory < 200MB for 10k nodes
- [ ] Accessible: Keyboard nav (Tab=clusters, Arrows=nodes), screen reader summary

## Files to Modify / Create

```
apps/web/src/features/runs/clusters/
├── ClusterGraph.tsx                    # Main WebGL canvas + UI
├── ClusterGraph.test.tsx
├── rendering/
│   ├── WebGLRenderer.ts                # Pixi.js / Three.js + instanced mesh
│   ├── NodeShader.ts                   # Vertex/fragment shaders
│   ├── EdgeShader.ts
│   ├── ClusterHullShader.ts            # Convex hull for clusters
│   └── rendererFactory.ts              # Canvas fallback
├── simulation/
│   ├── GPUForceSimulation.ts           # Compute shader or Web Worker
│   ├── CPUForceSimulation.ts           # Fallback (d3-force)
│   ├── simulationFactory.ts
│   └── LayoutPresets.ts                # ForceAtlas2, Fruchterman, Circular
├── interaction/
│   ├── ClusterGraphController.ts       # Pan/zoom/selection
│   ├── LassoSelectTool.ts              # Drag to select nodes
│   ├── DragMergeTool.ts                # Drag cluster onto cluster
│   ├── TimeScrubber.ts                 # Campaign timeline
│   └── KeyboardNavigator.ts            # Accessible navigation
├── data/
│   ├── ClusterDataProvider.ts          # API + SSE live updates
│   ├── ClusterHierarchy.ts             # Build tree from flat clusters
│   ├── ClusterMerger.ts                # Merge/split logic
│   └── useClusterData.ts
├── ui/
│   ├── ClusterLegend.tsx               # Interactive legend
│   ├── ClusterTooltip.tsx              # Rich hover panel
│   ├── ClusterSidePanel.tsx            # Node/cluster detail
│   ├── ClusterControls.tsx             # Layout, filters, time
│   └── ClusterSearch.tsx               # Filter clusters
└── hooks/
    ├── useClusterGraph.ts              # Main state
    ├── useGPUForceSimulation.ts
    └── useClusterInteraction.ts
```

**API** (enhance existing):
```
apps/web/src/app/api/runs/clusters/
├── data/route.ts                       # GET ?campaign=X&time=Y → nodes, edges, clusters
├── hierarchy/route.ts                  # GET ?clusterId=X → sub-clusters
├── merge/route.ts                      # POST {clusterA, clusterB} → merged
└── live/route.ts                       # SSE for real-time updates
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| 10k nodes render | 60fps | Benchmark |
| Force step (10k) | < 16ms | Benchmark |
| Live node add | < 100ms | E2E (SSE) |
| Cluster merge animation | 300ms smooth | Visual regression |
| Time scrub (100 steps) | 60fps | Benchmark |
| Export GraphML | Valid Gephi import | E2E |

## PR Guide

- Branch: `issue/008-run-cluster-visualization-webgl`
- Phase 1: WebGL renderer + basic force (CPU worker)
- Phase 2: GPU force simulation + live SSE updates
- Phase 3: Hierarchical clusters + merge/split + time scrubber
- Phase 4: Export + accessibility + search/filter
- **Dependencies**: `pixi.js` or `three.js` + `graphology`, `d3-force-3d`
- Update `docs/ARCHITECTURE.md` with cluster visualization architecture

## Related Issues

- Depends on: #002 (SSE for live updates), #005 (filters for cluster search)
- Blocks: #014 (regression detection via cluster evolution)
- Related: `run-cluster-canvas.tsx`, `run-cluster-visualization-utils.ts` (legacy — replace)

## Contributor Notes

**Start here if:** You have experience with:
- WebGL / Pixi.js / Three.js for graph rendering
- GPU compute shaders or Web Workers for physics simulation
- Graph algorithms (force-directed, clustering, hierarchy)
- Real-time data visualization with streaming updates

**Key challenges:**
- GPU force simulation: Compute shaders not widely supported → Web Worker fallback
- Instanced rendering: Uniform buffers for node positions, colors, sizes
- Cluster hulls: Convex hull per cluster, updated on simulation step
- Live updates: Incremental layout vs. full relayout

**Learning resources:**
- Pixi.js graph: https://pixijs.com/8.x/examples/graph
- Sigma.js: https://graphology.github.io/sigma.js/
- ForceAtlas2: https://github.com/jacomyal/forceatlas2
- WebGL instancing: https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes — WebGL expert on team