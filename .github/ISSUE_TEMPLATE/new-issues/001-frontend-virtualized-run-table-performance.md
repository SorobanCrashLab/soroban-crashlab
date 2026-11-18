---
name: "Frontend: Virtualized Run Table - Performance & Scalability Overhaul"
description: "Complete rewrite of the run table with virtualized rendering, infinite scroll, and sub-100ms interaction latency at 100k+ rows"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

The current run table (`apps/web/src/app/runs-table`, `apps/web/src/features/runs/implement-virtualized-run-table-component.tsx`) uses a basic virtualization approach that degrades significantly beyond 10,000 rows. At 100k+ runs (typical for production fuzzing campaigns), we observe:

- **Initial render**: 2.3-4.1s (target: <500ms)
- **Scroll jank**: 45-120fps drops during rapid scroll (target: 60fps sustained)
- **Column sort**: 1.8-3.2s for 50k rows (target: <200ms)
- **Filter application**: 800ms-1.5s (target: <150ms)
- **Memory growth**: Unbounded — detached DOM nodes accumulate, causing GC pressure

## Root Cause Analysis

1. **Incomplete virtualization**: Only rows are virtualized; column headers, filters, and footer remain in full DOM
2. **No windowing for columns**: Horizontal scroll renders all columns (up to 40+) regardless of viewport
3. **Sort/filter on main thread**: Large array operations block the event loop
4. **Missing worklet/OffscreenCanvas**: No Web Worker offload for heavy computations
5. **React reconciliation overhead**: Each row is a full component tree with multiple `useMemo`/`useCallback` hooks

## Proposed Solution

Implement a **dual-axis virtualized data grid** using:

- **@tanstack/react-virtual v3** (or **react-virtualized-auto-sizer**) for battle-tested row/column virtualization
- **Web Worker** for sort/filter/aggregation via `Comlink` or native `Worker` + `postMessage`
- **OffscreenCanvas** for metric sparklines/mini-charts in cells
- **CSS Grid + `contain: strict`** for layout isolation
- **RequestIdleCallback** scheduling for non-urgent work

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  RunTableContainer (React)                                  │
│  ├── Virtualizer (row + column)                             │
│  ├── SortWorker (Web Worker)                                │
│  │   └── Handles: multi-column sort, filter, group-by       │
│  ├── RenderWorker (Web Worker, optional)                    │
│  │   └── Handles: cell formatting, sparkline generation     │
│  └── ViewportManager (resize + scroll sync)                 │
└─────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] Render 100,000+ runs at 60fps scroll
- [ ] Initial paint < 500ms (First Contentful Paint)
- [ ] Multi-column sort < 200ms for 50k rows
- [ ] Filter application < 150ms
- [ ] Column resize persistence (localStorage + URL state)
- [ ] Row selection (single, multi, range) with keyboard navigation
- [ ] Frozen columns (first 3: status, timestamp, campaign)
- [ ] Horizontal virtualization for 40+ columns
- [ ] Accessible: ARIA grid pattern, keyboard nav, screen reader announcements

### Non-Functional

- [ ] Bundle size impact < 15KB gzipped (tree-shakable)
- [ ] Zero runtime errors in Firefox, Safari, Chrome, Edge
- [ ] Works with React 19 concurrent features (`useTransition`, `useDeferredValue`)
- [ ] No memory leaks over 30-min session (heap snapshot diff < 5MB)
- [ ] Graceful degradation: fallback to pagination if WASM/Worker unavailable

## Files to Modify / Create

```
apps/web/src/components/data-grid/
├── VirtualizedDataGrid.tsx           # Main entry point
├── VirtualizedDataGrid.test.tsx      # Comprehensive tests
├── virtualizer/
│   ├── rowVirtualizer.ts             # Row virtualization logic
│   ├── columnVirtualizer.ts          # Column virtualization logic
│   └── viewportSync.ts               # Scroll/resize synchronization
├── workers/
│   ├── sortFilterWorker.ts           # Web Worker for sort/filter
│   ├── sortFilterWorker.test.ts
│   └── comlink-wrapper.ts            # Type-safe worker communication
├── cells/
│   ├── CellRenderer.tsx              # Generic cell with memoization
│   ├── SparklineCell.tsx             # OffscreenCanvas sparkline
│   ├── StatusBadgeCell.tsx           # Memoized status rendering
│   └── index.ts
├── hooks/
│   ├── useVirtualizedTable.ts        # Main hook
│   ├── useSortFilterWorker.ts        # Worker communication
│   └── useColumnResize.ts            # Column resize persistence
├── types.ts                          # Shared types
└── constants.ts                      # Configuration constants
```

## Acceptance Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial render (100k rows) | < 500ms | `performance.mark()` + Lighthouse |
| Scroll FPS (rapid) | 60fps sustained | Chrome DevTools Performance tab |
| Multi-column sort (50k) | < 200ms | `console.time()` in SortWorker |
| Filter apply (50k) | < 150ms | Same |
| Memory (30 min) | < 5MB growth | Heap snapshot diff |
| Bundle size | < 15KB gzip | `size-limit` CI check |

## PR Guide

- Branch: `issue/001-virtualized-run-table-performance`
- One PR per logical component (virtualizer → workers → cells → integration)
- **Do not** edit `pnpm-lock.yaml` or `package-lock.json`
- Add `@tanstack/react-virtual` to `package.json` (requires maintainer approval)
- Update `docs/ARCHITECTURE.md` with data grid architecture section
- Add performance benchmarks to `scripts/perf-harness.mjs`

## Related Issues

- Blocked by: None
- Blocks: #002 (run comparison side-by-side), #003 (cross-run board widgets)
- Depends on: React 19 upgrade (already on 19.2.3)

## Contributor Notes

**Start here if:** You have experience with:
- Virtualized lists (@tanstack/react-virtual, react-window, react-virtualized)
- Web Workers + Comlink or native postMessage
- OffscreenCanvas / Canvas 2D for data visualization
- React 19 concurrent features and performance profiling

**Learning resources:**
- @tanstack/react-virtual docs: https://tanstack.com/virtual/v3
- Web Worker patterns: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- React 19 performance: https://react.dev/learn/render-and-commit

**Estimated effort:** 3-4 weeks for experienced contributor; 6-8 weeks for learning contributor
**Mentorship available:** Yes — tag `@maintainer-web` in PR for pairing session