# Performance Budgets (WIP)

Tracks issue #2280. This is a status note, not a finalized budget policy.

Current defaults in `apps/web/src/lib/perf/budgets.ts` (apply to all routes, `route: "*"`):

| Metric | Threshold |
| --- | --- |
| LCP | 2500ms |
| CLS | 0.1 |

These are placeholder values, not reviewed per-route targets. Open items:

- Per-route/per-feature threshold configuration (today everything falls back to the
  wildcard budget)
- INP budget once INP collection exists (see
  [frontend-observability.md](./frontend-observability.md))
- Threshold configuration surfaced in the performance dashboard UI, not just hardcoded
- Linking budget breaches to alert/notification rules (#041/#049)
