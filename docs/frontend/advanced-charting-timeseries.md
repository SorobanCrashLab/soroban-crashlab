# Advanced charting and time-series interaction

Shared chart layer for analytics, ops and performance views (#2302).

## Pieces

| Path | Purpose |
|---|---|
| `components/charts/primitives/TimeSeriesChart.tsx` | SVG chart: multi-series, left/right axes, thresholds, bands, annotations, tooltip, legend |
| `components/charts/primitives/BrushZoomController.tsx` | Drag-to-zoom (`useBrushZoom`) |
| `components/charts/transforms/downsample.ts` | `lttb`, `minMaxBuckets`, `sliceRange` |
| `components/charts/transforms/normalize.ts` | `%` change, z-score, index-to-100, previous-period shift |
| `components/charts/hooks/syncGroup.ts`, `useSyncedCharts.ts` | Shared cursor and visible range per `syncGroup` id |
| `features/analytics/charts/ChartStateUrl.ts` | Range, series, normalization and compare state in the URL |
| `features/analytics/charts/ComparativeMetricsPanel.tsx` | Ready-made comparison panel with presets, CSV export and share link |

## Using it

```tsx
<ComparativeMetricsPanel
  series={[
    { id: 'crash', label: 'Crash rate', unit: '%', color: '#dc2626', data: [...] },
    { id: 'latency', label: 'Latency', unit: 'ms', color: '#2563eb', axis: 'right', data: [...] },
  ]}
/>
```

Charts that share `syncGroup` share the hover cursor and the zoomed range.

## Behaviour

- **Downsampling**: each series is reduced to `maxPoints` (default 600) after the visible range is applied. LTTB (default) keeps the shape; use `strategy="minmax"` when spikes must never be lost. A "N% of points shown" badge appears whenever data is reduced; zooming in shows more raw points.
- **Normalization** puts different units on one axis. A zero baseline never produces `NaN`/`Infinity` (it reports 0 / index 100).
- **Accessibility**: the chart is focusable (`←`/`→` move the cursor, `+` zooms in, `-` or `Escape` resets), has a plain-language trend summary as its label, and "Show data table" swaps in a real table.
- **Share/export**: `?range=<from>-<to>&series=a,b&norm=zscore&compare=1`. CSV export covers the displayed series.

## Limits

Rendering is SVG, which is smooth with downsampling up to 100k+ source points per series; a canvas/WebGL renderer and worker offloading are not included yet. PNG export and visual regression tests are follow-ups.

Tests: `npm run test:features` (from `apps/web`).
