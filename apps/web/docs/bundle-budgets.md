# Per-Route-Group Bundle Budgets

Enforced via [`size-limit`](https://github.com/ai/size-limit) in `apps/web`.
Config lives in `apps/web/.size-limit.json`; CI runs in
`.github/workflows/size-limit.yml` and **fails the PR** when any route group
exceeds its budget.

## Route groups

| Route group            | Covers                                    | Budget (gzip)     |
| ---------------------- | ----------------------------------------- | ----------------- |
| `runtime-bootstrap`    | `.next/static/chunks/turbopack-*.js`      | 50 kB (4.0 kB)    |
| `shared-styles`        | `.next/static/chunks/*.css`               | 50 kB (36.4 kB)   |
| `static-bundles`       | `.next/static/chunks/*.js`                | 1500 kB (1.38 MB) |

Numbers in parentheses are the measured sizes at the last re-baseline.

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
above are the *proposed starting budgets*; they must be re-baselined against a
green `pnpm run build` before they are treated as authoritative (see
*Sequencing* below). To re-baseline:

1. From a clean `apps/web` with a successful `pnpm run build`:
   ```bash
   pnpm size --json > /tmp/size.json
   ```
2. Read each route group's `gzip` size, then set the limit to
   `measured * 1.10` (round up to a clean number).
3. Commit the updated `.size-limit.json` in the same PR that introduces the
   change (or as a follow-up budget-bump PR — see Override below).

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

`size-limit` exits non-zero and prints the offending group name and the
`size vs limit` delta, e.g.:

```
Package size limit has exceeded by 168 kB
  Path: .next/static/chunks/app/analytics/...
  Size: 169 kB (gzip)
  Limit: 1 B
```

(Exact numbers require a green build; the shape of the output is what matters
for the gate.)

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
- **Pass/Fail Gate**: `.github/workflows/size-limit.yml` checks route groups against `.size-limit.json`.
- **On Budget Failure**: CI runs `pnpm --dir apps/web run analyze`, uploads the interactive HTML treemaps (`client.html`, `nodejs.html`) + `route-sizes.json` as the `bundle-analysis-report` artifact.
- **Sticky PR Comment & Job Summary**: A per-route first-load JS breakdown table is posted to the PR and recorded in `$GITHUB_STEP_SUMMARY` for immediate regression debugging without local rebuilds.
- **Trend Tracking**: `.next/analyze/route-sizes.json` captures machine-readable per-route first-load JS metrics per build.

