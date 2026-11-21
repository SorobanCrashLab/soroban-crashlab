# Observability & Operations Dashboard (WIP)

Tracks issue #2271. This is an early scaffold, not a complete implementation.

`apps/web/src/app/api/health/` already provides basic liveness and metrics endpoints; this
scaffold does not yet aggregate them into the unified overview the issue asks for.

## Status

- [x] Panel stubs: service health, queue/worker, SLO, integration health, incident timeline
- [x] Drill-down stubs: diagnostics view, correlation view
- [x] `OpsDashboard` shell wiring service-health and queue/worker panels
- [x] `/ops`, `/ops/incidents`, `/ops/health` placeholder pages
- [x] `metrics`, `health-summary`, `incidents`, `correlations` API route stubs (return `501`)
- [ ] Real metrics aggregation from existing health endpoints, queues, and integrations
- [ ] SLO/error-budget calculation
- [ ] Cross-system correlation (alerts, deploys, failures, impacted runs/campaigns)
- [ ] Drill-down links to logs, traces, webhook deliveries, failing jobs
- [ ] Real-time updates via SSE/polling
- [ ] RBAC-gated ops/maintainer views and config-change audit
- [ ] `docs/ops/runbooks-index.md` content (see below — only a stub exists)

## Code

- `apps/web/src/features/ops/observability/`
- `apps/web/src/app/ops/`
- `apps/web/src/app/api/ops/`

See the full requirements in issue #2271.
