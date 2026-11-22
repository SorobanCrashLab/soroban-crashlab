# Mutation Strategy Lab

The strategy lab (issue #2328) makes fuzzing strategy tuning measurable, versioned and safely
deployable.

## Model

A `Strategy` contains mutators (kind, weight, enabled), a schedule (`fixed`, `adaptive`,
`round-robin`), constraints and tags. Helper functions:

- `validateStrategy` — rejects disabled-only pipelines, negative weights, empty weight sums,
  invalid constraints and version 0.
- `normalizeWeights` — rescales enabled weights to 100% while leaving disabled mutators untouched.
- `serializeStrategy` — canonical JSON (sorted tags and mutator ids) for reproducible experiments.
- `diffStrategies` — field-level differences between two presets.
- `compareExperiments` — coverage, crash, throughput, cost and time-to-first-crash deltas.
- `recommend` — flags starving mutators, diminishing returns, cost regressions and improvements.
- `evaluateRolloutGuard` — blocks rollout on lost crashes, cost regressions, missing approvals or
  missing permission.

## UI and API

- Page: `/strategies` — editable weights, preset selection, A/B metric table, recommendations and
  a rollout guardrail panel.
- API: `/api/strategies` (list/create presets, `POST { kind: "diff" }`) and
  `/api/strategies/experiments` (list/register experiments with deltas and guard decisions).

Re-registering a preset id requires a higher version; the API returns HTTP 409 otherwise.
