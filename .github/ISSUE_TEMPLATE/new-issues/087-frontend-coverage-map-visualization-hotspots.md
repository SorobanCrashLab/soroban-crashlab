---
name: "Frontend: Coverage Map & Hotspot Visualization - Source/Contract Coverage, Edge Discovery, and Gap Analysis"
description: "Deliver interactive coverage visualization for fuzzing campaigns including contract/source maps, edge/block heatmaps, uncovered hotspots, and coverage-over-time analysis"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Coverage is a key signal for fuzzing effectiveness, but users lack intuitive visual tools to understand what is exercised vs missed:
- No unified coverage map across contracts/functions/blocks/edges
- Hard to correlate new coverage with seeds, runs, and crashes
- Coverage trends and plateaus are not visible or actionable
- Large targets need performant, drillable visualizations

## Proposed Solution
Implement a **Coverage Map & Hotspot Visualization** suite:
- Treemap/graph/source overlays for coverage by contract/function/basic block
- Heatmaps for hit frequency, recency, and crash-associated paths
- Coverage-over-time and plateau detection views
- Drill-down from uncovered hotspots to suggested seeds/campaign actions

## Requirements
### Functional
- [ ] Coverage ingestion/model for blocks/edges/functions/contracts with provenance
- [ ] Visualizations: treemap, sunburst, heatmap, and trend charts with filters (#081)
- [ ] Hotspot/gap detection: uncovered critical paths, stale regions, regression in coverage
- [ ] Drill-down links to seeds/runs/traces and campaign designer recommendations (#086/#085/#068)
- [ ] Compare coverage across campaigns/runs/commits/time windows
- [ ] Export coverage reports and shareable views (#043/#056)

### Non-Functional
- [ ] Performant rendering for large binaries/coverage datasets (aggregation/LOD)
- [ ] Deterministic metrics and clear definitions (line/block/edge coverage semantics)
- [ ] Accessible color-safe palettes and non-visual summaries (#038)
- [ ] Permission-aware access to source/artifact-linked data

## Files to Modify / Create
```
apps/web/src/features/coverage/
├── CoverageDashboard.tsx
├── maps/CoverageTreemap.tsx
├── maps/CoverageHeatmap.tsx
├── trends/CoverageTrends.tsx
├── hotspots/GapAnalysisPanel.tsx
└── hooks/useCoverage.ts

apps/web/src/app/coverage/page.tsx
apps/web/src/app/api/coverage/route.ts
docs/frontend/coverage-map-visualization.md
```

## Acceptance Criteria
- Users can identify covered/uncovered areas and coverage trends clearly
- Hotspots link to actionable next steps (seeds/campaign tuning)
- Cross-run/campaign comparisons are accurate and performant
- A11y, exports, and permissions supported

## PR Guide
- Branch: `issue/087-frontend-coverage-map-hotspots`
- Phase 1: data model + base maps/trends
- Phase 2: hotspot/gap analysis + drill-down integrations
- Phase 3: comparisons + exports/share
- Phase 4: perf/a11y/tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
