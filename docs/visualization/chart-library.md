# Chart library

Shared chart components live in
[`apps/web/src/components/charts/`](../../apps/web/src/components/charts/).
They use inline SVG and semantic CSS tokens, with no new runtime dependency.

## Components

- `TimeSeriesChart`: line and area series.
- `BarChart`, `StackedBarChart`, `HistogramChart`, `ScatterChart`, and
  `HeatmapChart`: categorical/numeric
  comparisons and distributions.
- `Sparkline` and `Gauge`: compact inline trend and scalar status.
- `ChartContainer`: shared legend, keyboard point navigation, crosshair,
  synchronized cursor, range zoom, drill-down callbacks, annotations,
  thresholds, table alternative, and CSV/SVG/PNG export.

Provide a concise `title` and `description`; pass series as stable IDs, labels,
and data points shaped like `{ x, y }`. `ChartPoint` supports numeric,
date-like, and categorical x values. Use `syncGroup` to coordinate cursors
across charts. The `useStreamingSeries` helper caps retained points when
appending live data.

Charts are rendered on SVG. Each visible series is min/max-decimated to at most
roughly twice the configured bucket count, preserving endpoints and local
extrema; the default maximum is 1,200 buckets. The accessible data table shows
the first 500 rows, while CSV export preserves the complete input series.

Example:

```tsx
<TimeSeriesChart
  title="Crash rate"
  description="Daily crashes observed by signature."
  series={[{ id: 'crashes', label: 'Crashes', data: points }]}
  annotations={[{ id: 'deploy-42', x: deployAt, label: 'Deploy 42' }]}
  thresholds={[{ id: 'slo', value: 10, label: 'SLO' }]}
  onDrillDown={(selection) => openFilteredRuns(selection)}
/>
```

Provide visible textual status in addition to color. Keep chart controls
keyboard-operable, retain the table alternative, and describe the measured
range in the component description when a chart is filtered.
