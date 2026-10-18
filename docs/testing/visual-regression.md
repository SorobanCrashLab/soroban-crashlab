# Visual Regression Gate

Functional e2e tests prove a flow *works*; they say nothing about whether it
*renders* correctly. For a triage dashboard whose product is a dense table of
crash runs, a clipped column or an invisible label is a functional regression:
the row exists, the operator just cannot read it. This gate blessed-screenshots
the critical paths and diffs them on every relevant PR.

## Scope

| Area | Route | Viewports |
| --- | --- | --- |
| Runs list | `/runs` | desktop, mobile |
| Run detail | `/runs/[id]` | desktop, mobile |
| Crash cluster | `/analytics/clusters` | desktop |
| Replay history | `/runs/[id]/replay-history` | desktop |
| Settings | `/settings` | desktop |
| External auth | `/integrations/auth` | desktop |
| Landing / Start flow | `/`, `/start` | desktop, mobile |

Each path is captured in the light and dark themes. The specs live in
[`apps/web/e2e/visual/`](../../apps/web/e2e/visual) and
[`apps/web/e2e/visual.spec.ts`](../../apps/web/e2e/visual.spec.ts); the job is
`visual regression (chromium)` in
[`e2e.yml`](../../.github/workflows/e2e.yml).

## Determinism rules

A screenshot baseline is only useful if it is reproducible. Three sources of
variance are pinned:

- **Renderer.** The gate runs inside the `mcr.microsoft.com/playwright` image
  whose tag matches the pinned `@playwright/test` version. Baselines are never
  produced or compared outside that container, so fonts and antialiasing do not
  drift between a maintainer's laptop and CI.
- **Data.** Every spec seeds a fixed fixture and, where the page fetches, an
  explicit route interception. Nothing depends on the wall clock, so relative
  timestamps never leak into a baseline.
- **Motion and fonts.** `prefers-reduced-motion` is emulated,
  `animations: 'disabled'` and `caret: 'hide'` are set in the config, and each
  spec awaits `document.fonts.ready` before snapshotting.

## Threshold policy

Screenshots allow a **2% pixel delta** (`maxDiffPixelRatio: 0.02`), not a raw
pixel count. The tolerance exists to absorb sub-pixel font rendering noise, not
to hide layout changes: a two-column shift or a collapsed table blows well past
2%. Do not raise the threshold to make a diff pass — fix the layout or re-bless
the baseline deliberately.

## Approved-diff (re-bless) workflow

A baseline change is a reviewed decision, never a side effect.

1. On a mismatch, CI uploads the `visual-diffs` artifact containing the
   `*-expected.png`, `*-actual.png` and `*-diff.png` images side by side.
2. A reviewer confirms the pixel change is intentional by inspecting that
   artifact (not just the green check).
3. Regenerate and commit the baselines **in the same PR** as the UI change:

   ```bash
   pnpm --dir apps/web run test:visual:update
   ```

   For a standalone re-bless, dispatch the `e2e` workflow with
   `update-visual-baselines: true`; it uploads the regenerated
   `visual.spec.ts-snapshots/` as the `visual-baselines` artifact to commit.
4. The PNG changes are then visible in the PR diff and get a normal review.

Never merge a baseline change that you have not looked at. A baseline that
quietly absorbed a real regression is worse than no gate at all.

## Rollout

The gate ships **report-only** while the baselines are bootstrapped: the job
runs, records diffs and uploads artifacts, but a mismatch does not fail the
build. Flip it to enforcement by setting the repository variable
`VISUAL_ENFORCE=true`; the `Enforce visual gate` step then fails on any
unmatched screenshot.

## Local runs

```bash
pnpm --dir apps/web run test:visual          # compare against baselines
pnpm --dir apps/web run test:visual:update   # regenerate baselines
```

The functional e2e config ignores these specs (`testIgnore` in
`playwright.config.ts`), so `pnpm --dir apps/web exec playwright test` does not
re-run them. Locally you should still prefer the pinned container when
regenerating baselines that CI will compare against.
