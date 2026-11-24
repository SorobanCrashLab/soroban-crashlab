# Chaos & Failure Injection Control UI

Tracks issue #2340. `/resilience/chaos` is a control plane for designing, approving, running, monitoring and analysing failure-injection experiments against workspaces, campaigns, runners and integrations, with safety defaults throughout.

> **Executor.** The default executor is **simulated**. Lifecycle, guardrails, approvals, halt rules, telemetry and reports all run end to end, but no real traffic is altered. Real injection plugs in through the `ChaosExecutor` interface (`lib/server.ts`) and real metrics through `ChaosTelemetrySource` (`lib/monitor.ts`). The UI states which executor is active.

## Workflow

1. **Design**: start from a template (RPC latency spike, runner CPU pressure, integration error burst, campaign packet drop) or from blank. Choose targets from the inventory, faults (latency, error, drop, throttle, CPU or memory pressure, each with validated parameters), duration, an optional schedule, guardrails, halt rules and tags.
2. **Dry run**: the server estimates impact (targets plus dependents, runs affected per hour, blast radius as a percentage of capacity, expected error-rate and latency delta) and runs preflight checks.
3. **Save**: saves a draft. Each change to a draft creates a new **version** with a definition fingerprint. Saving never starts anything.
4. **Submit → approve**: approvals come from maintainers other than the author, one each. Production always needs two. Experiments that need no approvals go straight to *approved*.
5. **Start**: requires a passing preflight *at start time* and the experiment name typed as confirmation. Staging and prod starts need a maintainer.
6. **Monitor**: live metrics (error rate, p95 latency, SLO burn rate, data quality, CPU) with halt thresholds, affected runs and injected faults, polled every 2 s. **Stop** ends the experiment gracefully. **Abort** is the emergency stop. **Abort all** stops every active experiment at once.
7. **Analyse**: verdict (hypothesis *supported* / *refuted* / *inconclusive*), baseline/peak/final metrics, findings, follow-ups (incident, runbooks, campaign runs, correlated logs, release-readiness blocker), and Markdown or JSON report export.

## Safety rules

| Rule | Where |
| --- | --- |
| At least one halt rule; error/SLO/incident rule recommended | `lib/model.ts`, `lib/guardrails.ts` |
| Targets must resolve; environments must be in the allowlist | `preflight` |
| Blast radius ≤ limit; targets incl. dependents ≤ concurrency limit | `preflight` |
| No overlap with a running experiment on the same targets | `preflight` |
| Maintenance windows (dev any time; staging weekdays 08–20 UTC; prod Tue/Thu 14–16 UTC) when enabled | `lib/inventory.ts` |
| Prod: ≥ 2 approvals, ≤ 15 min | `preflight`, `requiredApprovals` |
| Typed confirmation; maintainer for staging/prod starts | `lib/lifecycle.ts` |
| Abort from any non-terminal state by any signed-in analyst; a reason is required; idempotent | `lib/lifecycle.ts` |
| Accepted aborts always re-signal the executor (`revoke`), even if already aborted | control route |
| Locked definitions: only draft/rejected experiments can be edited | `ChaosStore.save` |

**Automatic halts**: running experiments are advanced on every read or control call. A halt rule fires once its metric breaches for `forSamples` consecutive 10 s samples (debounced). The experiment becomes `halted` at that sample and faults are revoked. A simulated incident trigger (#066) fires on a sustained error rate above 25%. When the duration elapses, the experiment becomes `completed`.

Every save and control action is recorded in the experiment's event log and the append-only audit log (`chaos.experiment.save`, `chaos.experiment.control`).

## Determinism

Definitions serialize canonically (sorted keys; targets, faults, allowlist and tags sorted) to a fingerprint recorded on every version and in reports. Model telemetry is a pure function of (experiment id, definition, elapsed time), so halts, verdicts and exported reports are reproducible.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/chaos/experiments` | Experiments (advanced to now) with allowed actions, templates, inventory, maintenance windows, executor mode |
| `POST /api/chaos/experiments` | `save` (create or new version), `dry-run`, `abort-all` |
| `GET /api/chaos/experiments/[id]/control[?format=markdown]` | Record, preflight and impact, samples, allowed actions, analysis, Markdown report |
| `POST /api/chaos/experiments/[id]/control` | `submit`, `approve`, `reject`, `start`, `stop`, `abort` |

Mutations use the `strict` rate-limit bucket.

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/chaos/lib/model.ts` | definition schema, validation, fingerprints |
| `.../lib/inventory.ts` | targets, capacity, maintenance windows |
| `.../lib/templates.ts` | templates |
| `.../lib/guardrails.ts` | impact estimate, preflight |
| `.../lib/lifecycle.ts` | state machine, permissions, advancement |
| `.../lib/monitor.ts` | telemetry source, halt rules |
| `.../lib/analysis.ts` | analysis and report |
| `.../lib/server.ts` | store, executor seam, audit (server-only) |
| `.../ChaosControlCenter.tsx`, `ExperimentDesigner.tsx`, `GuardrailsPanel.tsx`, `LiveExperimentMonitor.tsx`, `ExperimentAnalysis.tsx`, `hooks/useChaosExperiments.ts` | UI |

## Known gaps

- Simulated executor and model telemetry by default (see the note at the top). The target inventory is a static registry until workspaces, runners and integrations expose one.
- Scheduled start times are validated and displayed, but starting is manual. There is no scheduler worker.
- Experiment records are process-local, like the other wave-4 stores.

## Tests

`apps/web/src/features/chaos/lib/chaos.test.ts` covers validation, fingerprints, impact, guardrails, lifecycle safety (including two-person prod approval), telemetry, halt debouncing, advancement, analysis and the store. `apps/web/src/app/api/chaos/experiments/routes.test.ts` covers the end-to-end approve → confirm → start → abort path, executor signaling, emergency stop all and reports.
