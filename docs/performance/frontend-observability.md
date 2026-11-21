# Frontend Performance Observability (WIP)

Tracks issue #2280. This is an early scaffold, not a complete implementation.

The `web-vitals` package is not a project dependency, so `vitals.ts` uses the native
`PerformanceObserver` API directly and only covers LCP and CLS — INP, FCP, and TTFB are not
implemented.

## Status

- [x] `vitals.ts` (LCP, CLS via PerformanceObserver)
- [x] `marks.ts` (User Timing API wrapper for custom route/component timings)
- [x] `sampling.ts`, `reporter.ts` (best-effort POST to `/api/perf-metrics`, no retry/batching)
- [x] `budgets.ts` (static thresholds, no release/time-window regression comparison)
- [x] `PerformanceDashboard`, `RouteVitalsTable`, `RegressionAlerts` component stubs
- [x] `perf-metrics` and `perf-metrics/summary` API route stubs (return `501`)
- [ ] INP, FCP, TTFB collection
- [ ] Persistence/aggregation of reported metrics
- [ ] Real regression detection comparing releases/time windows
- [ ] Consent/privacy controls and PII-safe payload guarantees (see
      [budgets.md](./budgets.md) for the budget-config side of this)
- [ ] Correlation with release/version and feature flags
- [ ] Automatic instrumentation of key flows (run detail load, table interactions)
- [ ] Access-controlled metrics endpoint/UI

## Code

- `apps/web/src/lib/perf/`
- `apps/web/src/features/ops/performance/`
- `apps/web/src/app/api/perf-metrics/`

See the full requirements in issue #2280.
