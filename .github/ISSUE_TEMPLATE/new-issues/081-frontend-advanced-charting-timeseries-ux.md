---
name: "Frontend: Advanced Charting & Time-Series Interaction UX - Brush/Zoom, Multi-Axis, Downsampling, and Comparative Analysis"
description: "Upgrade charting foundations for large-scale time-series and analytical views with synchronized brush/zoom, multi-axis/multi-metric composition, LTTB/downsampling, and accessible interactions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Analytics surfaces (campaign trends, resource metrics, crash rates, ops health) need richer interaction and scale than current chart components provide:
- Charts struggle with high-cardinality/long-range time-series and cause render jank
- No consistent brush/zoom, range selection, or synchronized cursors across panels
- Comparing metrics with different units/scales is error-prone (no robust multi-axis/normalization UX)
- Tooltip/legend interactions and annotations are inconsistent across views
- Accessibility for data exploration (keyboard, summaries, data tables) is limited

## Proposed Solution
Deliver an **Advanced Charting & Time-Series UX layer**:
- Shared chart primitives for line/area/bar/heat/stack with composable overlays and annotations
- Brush/zoom, pan, range presets, and cross-chart synchronized cursors
- Multi-axis, normalized comparison, and baseline/target bands
- Smart downsampling (LTTB/min-max buckets) and progressive rendering
- Accessible exploration modes and export-ready chart states

## Requirements
### Functional
- [ ] Core primitives: responsive charts with tooltips, legends, markers, annotations, and thresholds
- [ ] Interactions: brush range selection, zoom/pan, reset, hover crosshair, synced cursor groups
- [ ] Multi-series composition: dual/multi-axis, unit-aware formatting, normalization (%/z-score/index)
- [ ] Time controls: presets, custom ranges, timezone awareness, compare-to-previous-period
- [ ] Downsampling strategies (LTTB, bucket min/max/avg) with fidelity indicators and raw-data drill-down
- [ ] Integration with campaign/ops/perf dashboards and run comparisons (#017/#050/#059/#067)
- [ ] Export chart image/data and shareable URL state for selected ranges/series (#043/#056)
- [ ] Accessible data table fallback, keyboard navigation, and descriptive summaries for key trends

### Non-Functional
- [ ] Smooth interaction at 100k+ points per series via canvas/WebGL where appropriate
- [ ] Deterministic rendering for same data/config; theme-aware (light/dark/high-contrast) (#046)
- [ ] Memoized data transforms and worker offloading for heavy aggregations
- [ ] Visual regression and interaction test coverage for chart behaviors (#077)

## Files to Modify / Create
```
apps/web/src/components/charts/
├── primitives/
│   ├── TimeSeriesChart.tsx
│   ├── ChartTooltip.tsx
│   ├── ChartLegend.tsx
│   └── BrushZoomController.tsx
├── transforms/
│   ├── downsample.ts
│   └── normalize.ts
└── hooks/useSyncedCharts.ts

apps/web/src/features/analytics/charts/
├── ComparativeMetricsPanel.tsx
└── ChartStateUrl.ts
docs/frontend/advanced-charting-timeseries.md
```

## Acceptance Criteria
- Dashboards support fast, consistent exploration of large time-series datasets
- Comparative and multi-axis analyses are accurate and understandable
- Chart interactions/states are shareable, exportable, and accessible
- Performance and visual consistency targets met across themes/viewports

## PR Guide
- Branch: `issue/081-frontend-advanced-charting-timeseries`
- Phase 1: primitives + transforms + basic interactions
- Phase 2: brush/zoom sync + multi-axis/compare modes
- Phase 3: integrations (analytics/ops/perf) + share/export
- Phase 4: perf optimization, a11y, visual tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
