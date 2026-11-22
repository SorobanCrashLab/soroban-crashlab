# Visualization performance guidelines

- Pass the full source series to the shared chart and use `maxPoints` to set a
  rendering budget. Min/max bucketing reduces 100,000 points to at most about
  2,402 SVG samples per visible series at the default 1,200 buckets while
  preserving endpoints and spikes.
- Keep streaming data append-only through `useStreamingSeries` and set a
  finite retention limit appropriate to the view. Replacing the returned
  array is supported; no global subscription or per-chart timer is retained.
- Avoid building duplicate chart data in the parent when the same
  transformation can be passed as typed `{ x, y }` points. Memoize expensive
  domain transformations when they are not covered by the built-in
  decimator.
- The data table is opt-in and limited to 500 displayed rows; CSV export uses
  all source points. Do not mount multiple full data tables for the same
  series.
- Lazy-load an entire dashboard panel when it is below the fold. The shared
  chart renderer does not import Recharts or another chart framework.

The 100k-point downsampling bound is covered by
`src/components/charts/utils/downsample.test.ts`. Measure browser interaction
latency and memory on the target dashboard before increasing bucket limits.
