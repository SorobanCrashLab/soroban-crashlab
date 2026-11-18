---
name: "Frontend: Visual Trace & Call Graph Inspector - Interactive Execution Graphs, Flame/Span Views, and Causal Navigation"
description: "Implement an interactive trace and call-graph inspector for Soroban executions with graph/flame/span visualizations, causal pathing, host-call drill-down, and cross-linking to crashes, logs, and state diffs"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Execution traces contain the causal story of a crash, but current views are largely linear and text-heavy. Investigators need structural understanding:
- Contract-to-contract calls, host function invocations, auth checks, and resource boundaries are hard to follow
- No interactive graph of execution paths, fan-out, retries, or revert propagation
- No flame/span aggregation to identify hotspots (budget, time, storage, call depth)
- Weak navigation between trace nodes, logs, artifacts, and source-mapped reproducer context
- Large traces overwhelm the browser without progressive rendering and summarization

## Proposed Solution

Build a **Visual Trace & Call Graph Inspector**:
- Multi-view trace explorer: graph view, flame graph, span/timeline waterfall, and hierarchical list
- Node-level drill-down for host calls, args/results (redacted/safe), budget deltas, auth context, and errors
- Causal path highlighting from crash/failure node back to probable origin
- Progressive loading, clustering, and summarization for large traces
- Deep integration with run detail workspace, diff viewer, and log/artifact panes

## Requirements

### Functional
- [ ] Parse and normalize trace data into graph/span models (calls, returns, traps, checkpoints, async/retry markers)
- [ ] Graph visualization with zoom/pan, expand/collapse, focus mode, minimap, and search (#008 patterns)
- [ ] Flame graph and span waterfall views with toggleable metrics (wall time, CPU budget, mem, storage ops)
- [ ] Node inspector panel: metadata, decoded payload summaries, budget/resource accounting, linked logs/artifacts
- [ ] Causal path tracing and "why this failed" highlighting from selected failure node
- [ ] Cross-view synchronization (select node in graph -> highlight in timeline/list/logs/diff)
- [ ] Filtering/grouping by contract, module, host function, error class, and depth
- [ ] Export graph snapshots and trace subsets; shareable deep links to focused nodes (#056)

### Non-Functional
- [ ] Handle 50k+ nodes via WebGL/canvas rendering, level-of-detail, and progressive expansion
- [ ] Interaction latency <100ms for common operations (select, expand, filter) on typical traces
- [ ] Deterministic layout for identical trace+settings; persisted layout preferences per user
- [ ] Accessible alternatives: keyboard graph navigation, tree/list fallback, text summaries for screen readers
- [ ] Sensitive data redaction hooks and permission checks for trace payloads

## Files to Modify / Create
```
apps/web/src/features/traces/inspector/
├── TraceInspector.tsx
├── views/
│   ├── CallGraphView.tsx
│   ├── FlameGraphView.tsx
│   ├── SpanWaterfallView.tsx
│   └── TraceTreeView.tsx
├── panels/
│   ├── NodeInspectorPanel.tsx
│   └── TraceFiltersPanel.tsx
├── layout/
│   ├── graphLayout.ts
│   └── clustering.ts
└── hooks/useTraceInspector.ts

apps/web/src/app/runs/[id]/trace/page.tsx
apps/web/src/app/api/runs/[id]/trace/route.ts
apps/web/src/lib/traces/
├── normalize.ts
├── causal-path.ts
└── metrics.ts
docs/frontend/trace-graph-inspector.md
```

## Acceptance Criteria
- Investigators can visually traverse execution structure and identify causal failure paths
- Graph/flame/span views stay synchronized and link to related evidence
- Large traces remain navigable and responsive with progressive rendering
- Exports/deep links reproduce focused inspection state
- Automated tests validate normalization, causal pathing, and interaction flows

## PR Guide
- Branch: `issue/068-frontend-visual-trace-graph-inspector`
- Phase 1: trace normalization/model + base inspector shell
- Phase 2: graph and flame/span visualizations
- Phase 3: causal pathing, cross-linking, filters/search
- Phase 4: performance optimization, a11y fallback, tests/docs
- Reuse visualization primitives (#047/#008) and integrate with #036/#044/#067

**Estimated effort:** 6-8 weeks (200 pts)
