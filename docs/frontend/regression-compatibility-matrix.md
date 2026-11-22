# Regression & Compatibility Matrix

The matrix view (issue #2329) analyses outcomes across multiple dimensions at once instead of
pairwise comparisons.

## Axes and metrics

Axis dimensions: `version`, `environment`, `target`, `runner`, `seedSet`. Metrics: `status`
(pass rate), `crashRate`, `signatureCount`. Rows and columns are sorted, and the cell cross-product
is always emitted, so missing configurations appear as `NO DATA` rather than disappearing.

## Analytics

- `buildMatrix` — deterministic aggregation with pass/fail/crash counts, top signatures and flaky
  run counts.
- `detectRegressions` — compares cell metrics to a baseline and reports worsening deltas only,
  with confidence derived from sample size (≥20 high, ≥5 medium, otherwise low).
- `isolateDimensions` — human-readable hints when every run for a dimension value fails.
- `exportMatrixCsv` — deterministic CSV with text status encodings (`PASS`, `WARN`, `FAIL`,
  `NO DATA`) so status is never colour-only.

## UI and API

- Page: `/analysis/regression-matrix` — axis/metric builder, accessible table with regression and
  flake overlays, dimension insights and CSV export.
- API: `/api/regression-matrix` — `GET` builds the matrix and insights; `POST { format: "csv" }`
  returns the export.
