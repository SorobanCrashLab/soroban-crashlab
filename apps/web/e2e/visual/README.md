# Visual Regression Specs

Snapshot specs for the triage dashboard critical paths. They live in their own
directory and run through `playwright.visual.config.ts` (the main e2e config
ignores them) so the visual gate can run in a pinned container with a stable
renderer.

## What is covered

| Path | Route | File |
| --- | --- | --- |
| Runs list (desktop + mobile) | `/runs` | `dashboard.spec.ts` |
| Run detail (desktop + mobile) | `/runs/[id]` | `dashboard.spec.ts` |
| Crash cluster | `/analytics/clusters` | `dashboard.spec.ts` |
| Replay history | `/runs/[id]/replay-history` | `dashboard.spec.ts` |
| Settings / auth | `/settings`, `/integrations/auth` | `dashboard.spec.ts` |
| Landing + Start flow | `/`, `/start` | `../visual.spec.ts` |

Every spec fixes three things that otherwise make screenshots flaky:

1. **Theme** — set through `localStorage['crashlab:theme']` before the first
   paint.
2. **Motion** — `prefers-reduced-motion` is emulated and
   `animations: 'disabled'` is set in the config.
3. **Data** — `seed.ts` intercepts `**/api/runs` with a fixed payload; the run
   detail page renders the deterministic server fixture, so no clock or
   network variance leaks in. Fonts are awaited via `document.fonts.ready`.

## Baselines

Baselines are committed PNGs in `../visual.spec.ts-snapshots/`, named
`<arg>-chromium.png`. Because the snapshot path template is
`{snapshotDir}/{arg}-{projectName}{ext}`, **screenshot names must be globally
unique across all visual specs**.

### Blessing a change (approved-diff workflow)

1. The `visual regression (chromium)` CI job attaches any diff images
   (`*-diff.png`, `*-actual.png`, `*-expected.png`) as the `visual-diffs`
   artifact when a screenshot does not match.
2. Confirm the pixel change is intentional by reviewing that artifact.
3. Regenerate the baselines and commit them **in the same PR** as the UI change
   (or a dedicated re-bless PR that attaches the artifact):

   ```bash
   pnpm --dir apps/web run test:visual:update
   ```

4. Review the changed PNGs in the PR diff — a baseline change is a reviewed
   decision, never an automatic side effect.

### Bootstrap

The gate ships report-only. On the first run there are no dashboard baselines
yet, so the job records the actuals as artifacts without failing the build.
Flip it to enforcement by setting the repository variable
`VISUAL_ENFORCE=true`.

## Threshold

Screenshots tolerate a 2% pixel delta (`maxDiffPixelRatio: 0.02`) to absorb
font-rendering variance. Keep the threshold tight — a threshold wide enough to
hide a layout break is worse than a noisy gate. See
[docs/testing/visual-regression.md](../../../../docs/testing/visual-regression.md)
for the full policy.
