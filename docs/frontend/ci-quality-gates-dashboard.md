# CI Checks & Quality Gates Dashboard

Tracks issue #2314. Route: `/quality/ci`.

The dashboard answers four questions from one normalized snapshot: can this PR merge,
which of the eight quality gates are blocking, which tests are flaky, and is the
release ready. It ships with a deterministic mock provider and an opt-in GitHub
Actions adapter; browser code never sees a provider token.

## Code

| Path | Purpose |
| --- | --- |
| `apps/web/src/features/ci/lib/model.ts` | Framework-free domain model, gate catalogue and default budgets |
| `apps/web/src/features/ci/lib/status.ts` | Status normalization, required-check rules, rerun selection and rollups |
| `apps/web/src/features/ci/lib/gates.ts` | Gate observations, budget evaluation and display-ready cards |
| `apps/web/src/features/ci/lib/flake.ts` | Deterministic flake scoring from pass/fail flips and rerun recoveries |
| `apps/web/src/features/ci/lib/correlation.ts` | Failure correlation with rules, evidence and confidence |
| `apps/web/src/features/ci/lib/release.ts` | Release-readiness roll-up of gates, checks, flakes and incidents |
| `apps/web/src/features/ci/lib/freshness.ts` | TTL/SWR assessment, cache headers and `Retry-After` parsing |
| `apps/web/src/features/ci/lib/cache.ts` | Bounded client cache and rate-limit-aware retry decisions |
| `apps/web/src/features/ci/lib/permissions.ts` | Server-side role projection of artifacts, links and private paths |
| `apps/web/src/features/ci/lib/saved-views.ts` | Canonical saved-view tokens and share URLs |
| `apps/web/src/features/ci/lib/query.ts` | Zod query parsing and deterministic run filtering |
| `apps/web/src/features/ci/lib/provider.ts` | Provider interface consumed by the routes |
| `apps/web/src/features/ci/lib/mock-provider.ts` | Fixed fixture snapshot; identical bytes on every call |
| `apps/web/src/features/ci/lib/github-adapter.ts` | GitHub REST mapping and server-only client |
| `apps/web/src/features/ci/lib/server.ts` | RBAC, provider selection and cached success envelope |
| `apps/web/src/features/ci/lib/api.ts` | Shared wire contracts for the two endpoints |
| `apps/web/src/features/ci/hooks/useCiQuality.ts` | Client data hook: URL sync, cache, actions and derived reports |
| `apps/web/src/features/ci/CiQualityDashboard.tsx` | Accessible tabbed shell and filter bar |
| `apps/web/src/features/ci/PrReadinessView.tsx` | Run table, job/step/check drill-down and correlations |
| `apps/web/src/features/ci/GateStatusCards.tsx` | Eight gate cards with budgets and local actions |
| `apps/web/src/features/ci/FlakeInsights.tsx` | Flake leaderboard with evidence |
| `apps/web/src/features/ci/ReleaseReadiness.tsx` | Release blockers, warnings and gate budget matrix |
| `apps/web/src/app/api/ci/runs/route.ts` | `GET /api/ci/runs` |
| `apps/web/src/app/api/ci/gates/route.ts` | `GET /api/ci/gates` |
| `apps/web/src/app/quality/ci/page.tsx` | Page |

Both routes are registered in `apps/web/src/lib/route-catalog.ts` as read-only
session routes. The catalog completeness test fails if a handler is added without
a matching entry.

## Status normalization

Providers expose a wide vocabulary (`success`, `failure`, `timed_out`,
`action_required`, `cancelled`, and active states). Every job, step and check is
reduced to five statuses:

| Status | Meaning |
| --- | --- |
| `pass` | Successful conclusion |
| `fail` | Failed, timed out or errored |
| `warn` | Neutral/action required or an unknown conclusion |
| `skip` | Skipped, cancelled or no check ran |
| `pending` | Queued/in progress with no conclusion yet |

Rules that matter for merge/release decisions:

- A required check whose normalized status is `skip` or `warn` becomes `fail`.
- Rollups rank `fail` above `pending`, then `warn`, then `pass`; all-skipped stays `skip`.
- Reruns are grouped by workflow/event/branch plus the original run id. The
  highest attempt wins, then the newest `updatedAt`, then the id as a tie-break.
  Older attempts remain available as `history` for flake scoring.

Unknown conclusions become `warn`, never `pass`.

## Quality gates

There are eight cards: lint & typecheck, unit tests, end-to-end tests, coverage,
mutation, performance, visual regression and security/dependencies.

Execution status always sets a floor: a failed job or required check blocks its gate.
Numeric budgets are evaluated against the snapshot policy:

| Gate | Default budget | Small regression |
| --- | --- | --- |
| Coverage | ≥ 80% line coverage | ≤ 0.5 pp drop → `warn` |
| Mutation | ≥ 60% mutation score | below floor → `fail` |
| Performance | p95 ≤ 1800 ms | ≤ 5% over budget with baseline → `warn` |
| Visual | pixel diff ≤ 0.5% | ≤ 0.25 pp over budget with baseline → `warn` |
| Security | 0 critical, ≤ 2 high CVEs | any breach → `fail` |

Mutation and visual are advisory by default; the other six are required. A gate
with no evidence is an explicit `skip` card, not a silent pass. Every card lists
its reasons, links and source run.

## Flake scoring

`score = 40·flipRate + 25·failureRate + 15·recentFailures + 10·recoveries + 10·areaBreadth`,
clamped to 0–100. A test is only eligible when it has at least three outcomes,
at least one pass and at least one failure. Severity bands are low (< 25), medium
(25–49), high (50–74) and critical (≥ 75). Confidence is `0.4 + 0.06·samples`,
capped at 1. The scorer never reads the wall clock: callers pass `nowMs`, and the
API uses the snapshot's `generatedAt` so mock output is byte-identical.

## Failure correlation

Failed step annotations and failed required checks become signals. Candidates are
known regressions, incidents and recent changes. Matching order:

1. explicit fingerprint;
2. shared code area plus shared tokens;
3. shared tokens;
4. shared code area only.

Confidence ranges from 0.42 (area only) to 0.98 (fingerprint). Every result
includes the rule, human-readable evidence and the signal ids that produced it.
Candidates recorded more than 21 days from a signal are ignored.

## Release readiness

The release tab rolls up required gate failures, failed required checks, active
incidents, correlated open regressions, critical flakes and in-progress runs into
`blockers` and `warnings`. The score starts at 100, loses 22 points per blocker
and 6 per warning, and is clamped. Status is `blocked` if any blocker exists,
`warning` if only warnings exist, otherwise `ready`. Every finding is actionable:
it links to a run, evidence URL or the other dashboard tabs.

## API

Both routes return the standard `{ data, total }` envelope and
`Cache-Control: private, max-age=30, stale-while-revalidate=300` with a strong
`ETag`. A matching `If-None-Match` returns `304` with no body. Invalid queries
return `422` with `{ error }`; `checkRbacPermission` denials keep their existing
shape.

`GET /api/ci/runs?view=&pr=&branch=&sha=&gate=&status=&q=&limit=`

`data` contains `runs` (latest attempts), `history` (older attempts keyed by
winning run id), `regressions`, `incidents`, `changes`, `policy`, `query`,
`repository`, `source`, `generatedAt`, `role`, `subject` and `permissions`.
`total` is the number of returned runs. `limit` is 1–200 (default 50).

`GET /api/ci/gates?view=&pr=&branch=&sha=&gate=&status=&q=&limit=`

`data` contains `evaluation` (eight cards), `flakes`, `correlations` plus the
same metadata fields. `total` is always 8. Flake scoring and correlation use
latest runs **and** their rerun history.

Query values are zod-validated and unknown keys are ignored. Views are `pr`,
`branch`, `release`, `flakes`, `gates` and `all`.

## Providers and configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CRASHLAB_CI_PROVIDER` | `mock` | Set to `github` to enable the Actions adapter |
| `CRASHLAB_CI_GITHUB_TOKEN` | unset | Server-side read token; never sent to the browser |
| `CRASHLAB_CI_REPOSITORY` | `SorobanCrashLab/soroban-crashlab` | `owner/repo` for the REST client |

The mock snapshot is a constant with `MOCK_GENERATED_AT` and no wall-clock or
credential reads. The GitHub adapter maps workflow runs, jobs, steps, check runs
and artifacts into the same model, sanitizes URLs and keeps the token in request
headers only. Branch protection's required-check list is not part of the check-run
REST payload; the mapping defaults checks to non-required, so a production
deployment should merge branch-protection data before relying on required-check
blockers.

## Permissions

`authorizeCiRequest()` uses the existing `checkRbacPermission()` and
`describePrincipal()`. GET routes are not role-gated by the catalog, so the
resolved role only narrows the payload:

| Role | Logs and check details | Artifacts | Internal artifacts / private paths | Subscriptions |
| --- | --- | --- | --- | --- |
| anonymous | no | public artifacts only | no | no |
| analyst | yes | yes | no | yes |
| maintainer | yes | yes | yes | yes |

URLs are sanitized (userinfo and credential-like query keys removed), author
emails are reduced to a login, and internal artifacts and file paths are removed
before any gate, flake or correlation computation runs.

## Client caching and notifications

The hook caches each endpoint+query for 30 seconds and serves stale data for up
to five more seconds while revalidating with the stored ETag. A `429` obeys
`Retry-After`; other `5xx` responses use bounded exponential backoff. Aborted
requests never overwrite the current view.

Filters, selected run and view name serialize into a canonical `ci1.` share
token; saved views live in local storage. Subscriptions and notification dismissal
are also local. They are a UI contract and a hook point for a delivery service —
no email, Slack or webhook is sent by this slice.

## Accessibility

- Tabs follow the WAI-ARIA pattern: roving `tabindex` and arrow/Home/End keys.
- Every table has a caption and scoped column headers.
- Status is always icon plus text; colour is secondary.
- Expandable job and evidence panels use native `details`/`summary`.
- Loading and action feedback use `role="status"`; errors use `role="alert"`.
- Forms have visible or screen-reader-only labels, and layouts are responsive.

## Tests

Pure helpers have colocated vitest files under `apps/web/src/features/ci/lib`.
Route tests live beside the handlers and mock `@/lib/rbac` so every role branch is
covered without a live session store.

```bash
pnpm --dir apps/web exec vitest run src/features/ci src/app/api/ci --passWithNoTests
pnpm --dir apps/web run lint
```

## Known limitations

- The GitHub adapter supplies no regressions, incidents or change records yet,
  so correlation evidence is richer in the deterministic fixture.
- The policy is read from the snapshot; there is no gate-configuration UI.
- Subscriptions and notifications are local-only, as described above.
