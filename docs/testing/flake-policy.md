# Flake Policy

A flaky test is a test that both passes and fails without a code change. The
default response — re-run CI until it is green — destroys the meaning of a red
build: the 13% flake in `run_health_status_cli.rs` sat in the suite precisely
because retries made it invisible. This policy makes flakes **visible, tracked
and time-boxed** instead of retried away.

## What CI does

[`flake-watch.yml`](../../.github/workflows/flake-watch.yml) runs on every PR
and nightly. It:

1. Re-runs the suite up to **K times** (`FLAKE_RETRIES`, default 3), recording
   every attempt to a JSON artifact.
2. Marks a test **flaky** when attempts disagree — a pass-after-failure is
   flaky, *not* green.
3. Ranks the worst offenders by rate, posts the report on the PR (upserted, so
   pushes update one comment), and uploads `flake-report.json` as an artifact
   for the dashboard.
4. Nightly, files or updates a single **Flaky test quarantine report** issue
   when anything crosses the threshold.

The probe never blocks a merge. The only hard failure is the committed
quarantine config, because a malformed or never-expiring quarantine is itself
the bug this issue exists to prevent.

## Thresholds

| Knob | Default | Meaning |
| --- | --- | --- |
| `FLAKE_RATE_THRESHOLD` | 5% | Disagreement rate above which a test is quarantinable |
| `FLAKE_RETRIES` | 3 | Attempts recorded per run |
| `FLAKE_WINDOW_RUNS` | 20 | Window the rate is judged over |

Both are repository variables, so they can be tuned without a code change.

The rate is the share of attempts that disagree with the majority outcome,
0–100 — the same shape used by
`apps/web/src/app/analytics/flaky/flaky-classification.ts` (see
[ADR-0005](../adr/0005-flaky-detection-and-ci-quarantine.md)).

## Quarantine list

Quarantined tests live in [`flake-quarantine.json`](../../flake-quarantine.json),
reviewed like any other code:

```json
{
  "policy": { "flakyRateThreshold": 5, "windowRuns": 20, "maxQuarantineDays": 14 },
  "quarantined": [
    {
      "id": "path/to/test.spec.ts::test title",
      "stack": "web",
      "reason": "why it is flaky, not that it is flaky",
      "quarantinedAt": "2026-10-17",
      "expiresAt": "2026-10-31",
      "observedRate": 13,
      "issue": "#1825"
    }
  ]
}
```

Rules enforced by `node scripts/flake/check-quarantine.mjs`:

- `expiresAt` is after `quarantinedAt` and **at most `maxQuarantineDays`
  (14) days** later — a quarantine can never be forever.
- `id`, `stack`, `reason`, `issue` and both dates are required; ids are unique.
- An entry at or below the threshold is flagged for **release**, not left to
  rot.
- Once past `expiresAt`, the nightly run **fails the config check** so the
  entry is escalated instead of silently persisting.

## Fixing a quarantined test

Root-cause first, always:

1. Read the recorded attempts in the `flake-report` artifact and identify the
   source of nondeterminism (shared state, clock, network, ordering,
   unawaited promise, unsorted map iteration).
2. Fix the cause, or, if the test is legitimately timing-dependent, make the
   assertion deterministic (fake clock, explicit ordering, injected seed).
3. Remove the entry from `flake-quarantine.json` **in the same PR** as the fix
   and confirm the nightly report shows it stable.
4. If it genuinely cannot be fixed yet, renew with a **new reason** and a fresh
   expiry — never widen the window to dodge the escalation.

**Never** "fix" a flake by adding a retry, re-blessing the snapshot, or
loosening a threshold. Those convert a visible bug into an invisible one, which
is the failure mode this policy exists to stop.

## Related

- [ADR-0005: Flaky detection and CI quarantine](../adr/0005-flaky-detection-and-ci-quarantine.md)
- [Visual regression gate](visual-regression.md)
- [`scripts/flake/`](../../scripts/flake) — `lib.mjs` (pure policy logic),
  `check-quarantine.mjs`, `summarize-runs.mjs`.
