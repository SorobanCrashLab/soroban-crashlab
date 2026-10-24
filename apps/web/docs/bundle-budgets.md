# Per-Route Performance Budgets

Two budget files gate performance in `apps/web`:

| File | Scope | Enforced by |
| --- | --- | --- |
| `.size-limit.json` | Whole-app route groups (bootstrap, CSS, all static JS) | `pnpm size` · `.github/workflows/size-limit.yml` |
| `perf-budgets.json` | Per-route first-load JS, route-only JS, RSC payload, hydration/LCP/INP | `pnpm perf:check` (offline) · `.github/workflows/perf-harness.yml` (server + browser) |

Both are **ratchets**: a PR may lower a value, but raising one requires the
reviewed bump process below. The offline gate runs on every PR; the browser
gate additionally records p95 hydration/LCP/INP on fixture data and treats
timing movement as advisory unless `--enforce-timing` is passed (Lighthouse
remains the hard LCP gate).

## Route groups

| Route group            | Covers                                    | Budget (gzip)     |
| ---------------------- | ----------------------------------------- | ----------------- |
| `runtime-bootstrap`    | `.next/static/chunks/turbopack-*.js`      | 12 kB (8.0 kB)    |
| `shared-styles`        | `.next/static/chunks/*.css`               | 40 kB (34.2 kB)   |
| `static-bundles`       | `.next/static/chunks/*.js`                | 1300 kB (1.12 MB) |

Numbers in parentheses are the measured sizes at the last re-baseline
(2026-10-19, #1881).

`pnpm size` runs `scripts/check-size-budgets.mjs`, a dependency-free
implementation of the `path` / `gzip` / `limit` subset used here. It reads the
same `.size-limit.json` and fails non-zero on a breach. (The previous CLI call
could not load its plugin because the installed `@size-limit/file` major did
not match `size-limit`, so the gate never actually ran.)

> **Turbopack chunk naming.** Next 16 builds with Turbopack, which emits client
> chunks as flat content-hashed files directly under `.next/static/chunks/`
> (e.g. `01b4ae0ef5853668.js`) — there is no stable per-route file name. The old
> `landing-sandbox` group globbed `.next/static/chunks/app/page-*.js`, a
> webpack-era path that Turbopack never produces, so that entry matched nothing
> and failed the size gate on **every** PR (`Size Limit can't find files at
> .next/static/chunks/app/page-*.js`). The entry was removed; the landing page's
> JS is bounded by the whole-app `static-bundles` budget. Do not reintroduce
> per-route globs unless chunk naming is restored.

## Methodology

Budgets are set from **measured first-load JS + 10% headroom**. The numbers
above are the last re-baseline; re-derive them against a green
`pnpm run build` whenever the bundle changes materially. To re-baseline:

1. From a clean `apps/web` with a successful `pnpm run build`:
   ```bash
   pnpm size
   pnpm perf          # writes .next/analyze/perf-report.{json,md}
   ```
2. Read each measured size, then set the limit to `measured * 1.10` (round up
   to a clean number).
3. Commit the updated `.size-limit.json` / `perf-budgets.json` in the same PR
   that introduces the change (or as a follow-up budget-bump PR — see
   Override below).

## Why per-group

A single global chunk budget hides which surface regressed (the
charts-everywhere incident being the canonical example). Per-group budgets
name the offending route in CI output, so a PR that only touches analytics
cannot silently bloat the editor bundle, and vice-versa.

## Override procedure (budget bumps)

A PR that intentionally grows a budget (new chart type, new editor feature)
must **not** silently raise the limit. Budget-bump PRs require:

- A `## Budget bump` section in the PR body stating:
  - which route group's limit changed,
  - the old → new number,
  - the justification (feature need, dependency upgrade with no tree-shake path, etc.),
  - the expected steady-state size after the change lands.
- Maintainers review bumps the same as any behaviour change.

Emergency hotfixes may raise a limit with post-hoc justification within 24h,
but the justification must still be recorded in the merged PR.

## Simulated violation (local proof)

To confirm failure output is actionable, temporarily lower a budget far below
its real size, e.g. in `.size-limit.json` set `"limit": "1 B"` for
`static-bundles`, then:

```bash
cd apps/web && pnpm size
```

The runner exits non-zero and marks the offending group `FAIL` in its table
with the measured bytes and limit. (Exact numbers require a green build; the
shape of the output is what matters for the gate.)

## Per-route harness (`perf-budgets.json`)

```bash
# Offline: build manifests only (deterministic; runs in size-limit.yml)
pnpm --dir apps/web run perf:check

# Full: start `next start -p 3210` first, then measure RSC + browser timings
pnpm --dir apps/web exec node scripts/perf-harness.mjs \
  --base-url http://127.0.0.1:3210 --browser \
  --routes '/,/dashboard,/runs,/runs/[id],/analytics' --check --require-runtime

# Ratchet the committed file down to the new measurements
pnpm --dir apps/web run budget:update
```

The file records, per route: `firstLoadJsGzip`, `firstLoadJsRaw`,
`routeOnlyJsGzip`, `routeOnlyJsRaw`, `rscPayloadBytes`, `htmlBytes`,
`ttfbMs`, `hydrationMs`, `lcpMs`, `inpMs`. Dynamic `/runs/[id]` is measured
against the deterministic fixture `/runs/run-1024`.

Size budgets must not grow at all (`sizePct: 0`); RSC payloads get 3%; browser
timings get 25% plus absolute floors (TTFB 800 ms, hydration 1500 ms, LCP
2500 ms, INP 1000 ms) so local jitter is not reported as a regression. Raising
any value requires `--allow-increase --reason "<why>"`, which records the
reason in the diff for review.

## Sequencing

If the lazy-chart loading work (#1396-adjacent) merges first, re-baseline the
`analytics-charts` budget afterwards using the methodology above rather than
baking extra headroom into this PR to compensate. Headroom stays at 10%; do not
game it.

## Bundle Analysis & Visual Treemaps

When investigating regressions or optimizing route code-splitting, run the bundle
analyzer locally:

```bash
# Run bundle analysis locally (generates HTML treemaps in .next/analyze/)
pnpm --dir apps/web run analyze

# Generate per-route first-load JS metrics and markdown report
node apps/web/scripts/analyze-bundles.mjs
```

### CI Artifacts & PR Breakdown
On pull requests:
- **Pass/Fail Gate**: `.github/workflows/size-limit.yml` checks route groups against `.size-limit.json` and per-route first-load JS against `perf-budgets.json`.
- **Perf Harness**: `.github/workflows/perf-harness.yml` starts a production server, measures RSC payload and p95 hydration/LCP/INP on fixture data, and uploads `perf-report.{json,md}`. RSC and route-size budgets are hard gates; timing metrics are advisory.
- **On Budget Failure**: CI runs `pnpm --dir apps/web run analyze`, uploads the interactive HTML treemaps (`client.html`, `nodejs.html`) + `route-sizes.json` as the `bundle-analysis-report` artifact.
- **Sticky PR Comment & Job Summary**: A per-route first-load JS breakdown table is posted to the PR and recorded in `$GITHUB_STEP_SUMMARY` for immediate regression debugging without local rebuilds.
- **Trend Tracking**: `.next/analyze/route-sizes.json` captures machine-readable per-route first-load JS metrics per build.

