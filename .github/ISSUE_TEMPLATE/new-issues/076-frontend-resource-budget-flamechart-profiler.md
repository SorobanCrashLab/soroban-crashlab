---
name: "Frontend: Resource & Budget Flamechart Profiler - CPU, Memory, Ledger I/O, and Soroban Budget Hotspot Analysis"
description: "Create an interactive profiling UI for Soroban run resource consumption with flamecharts, budget timelines, hotspot attribution, and regression comparison across executions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Performance and budget exhaustion issues are common in Soroban fuzzing, but users cannot easily see where resources are consumed:
- No unified view of CPU/instruction, memory, ledger read/write, and fee/budget metrics over execution
- Hotspots across contracts/functions/host calls are hard to attribute from raw traces
- Budget failures lack visual explanation of accumulation and threshold crossings
- Comparing resource profiles between runs/commits/campaigns is manual
- Large profiles are expensive to render without aggregation and sampling controls

## Proposed Solution
Build a **Resource & Budget Flamechart Profiler**:
- Flamechart/icicle and timeline views aligned to trace spans and phases
- Multi-metric overlays (budget, CPU, memory, ledger I/O, events) with threshold markers
- Hotspot table with attribution by contract, function, host call, and call path
- Comparative profiling (A/B runs, before/after regression) with delta visualization
- Drill-down links to trace nodes, state changes, and source/reproducer context

## Requirements
### Functional
- [ ] Ingest normalized profiling metrics from traces/run summaries/artifacts with metric schema versioning
- [ ] Flamechart and timeline visualizations with zoom, stack focus, search, and path highlighting
- [ ] Metric selector and synchronized cursors across views (budget, CPU, mem, read/write bytes/entries)
- [ ] Threshold/budget exhaustion markers and "first exceedance" navigation
- [ ] Hotspot ranking and attribution views with filters and group-by dimensions
- [ ] A/B comparison mode with absolute/relative deltas and regression flags (#019/#067)
- [ ] Export profile snapshots/reports and shareable deep links to focused stacks/time ranges
- [ ] Permission-aware handling for any sensitive execution metadata

### Non-Functional
- [ ] Handle 1M+ samples/spans via aggregation, WebGL/canvas rendering, and workers
- [ ] Sub-100ms interaction targets for zoom/filter on common profiles
- [ ] Deterministic aggregation results for same inputs/settings
- [ ] Accessible non-visual summaries and keyboard navigation for profiler controls

## Files to Modify / Create
```
apps/web/src/features/profiler/
├── ResourceProfiler.tsx
├── views/
│   ├── FlamechartView.tsx
│   ├── BudgetTimelineView.tsx
│   └── HotspotsTable.tsx
├── compare/ProfileComparePanel.tsx
├── workers/profileAggregationWorker.ts
└── hooks/useResourceProfiler.ts

apps/web/src/app/runs/[id]/profile/page.tsx
apps/web/src/app/api/runs/[id]/profile/route.ts
apps/web/src/lib/profiling/
├── normalize.ts
├── aggregate.ts
└── compare.ts
docs/frontend/resource-budget-profiler.md
```

## Acceptance Criteria
- Users can identify resource/budget hotspots and explain exhaustion/regressions visually
- Comparative profiling highlights meaningful deltas and links to causal evidence
- Large profiles remain responsive and accurate under aggregation
- Exports/deep links and permissions behave correctly

## PR Guide
- Branch: `issue/076-frontend-resource-budget-profiler`
- Phase 1: metric normalization + flamechart/timeline base views
- Phase 2: hotspot attribution + thresholds + drill-down links
- Phase 3: comparison mode + export/share
- Phase 4: performance scaling, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
