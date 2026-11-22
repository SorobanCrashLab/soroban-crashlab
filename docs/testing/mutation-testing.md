# Mutation testing policy

Line coverage tells you a line executed. It does not tell you a test would
notice if that line were wrong. In the classification and security modules a
surviving mutant is not a metric problem — it is a silent wrong answer or an
auth bypass with a green build. The mutation gate closes that gap (issue
#1821).

## What runs

| Stack | Tool | Scope | Cadence |
| --- | --- | --- | --- |
| `contracts/crashlab-core` | [`cargo-mutants`](https://mutants.rs) | `taxonomy.rs`, `fixture_classifier.rs`, `signature_hash.rs`, `replay.rs` | PRs (changed lines) + nightly (full) |
| `apps/web` | StrykerJS | `src/lib/api-key-auth.ts`, `src/lib/rbac.ts`, `src/lib/storage/api-token-store.ts` | nightly / manual |

> The manual run is not run on PRs, so a PR only pays for the mutants it
> touches. Full runs live on the `nightly` schedule.

## Phase: report-only, then enforce

The gate ships **report-only** (`MUTATION_ENFORCE` unset). On every run it
prints new survivors and annotates critical ones, but does not fail. This is the
one-week bootstrap described in the issue: it gives the baseline time to settle
before it can block anyone.

To flip the gate to enforcement, set the repository variable
`MUTATION_ENFORCE=true` (Settings → Variables → Actions). No workflow change is
needed. A manual `workflow_dispatch` run can also pass `enforce=true` to test
the enforcement path without changing the repository variable.

## The baseline

`contracts/crashlab-core/mutation-baseline.json` and
`apps/web/mutation-baseline.json` record the survivors we have accepted. The
comparison is by `file::mutant-name`, so it is stable across re-runs and across
mutant ordering.

- **New survivor in a critical module** → the gate fails once enforcement is on.
- **New survivor elsewhere** → reported only.
- **Baseline survivor no longer survives** → listed as *killed since baseline*;
  prune it. A stale baseline is how a gate rots.

The report is deterministic: `cargo-mutants` walks mutants in a fixed order and
the comparison sorts by key, so re-running an unchanged commit produces an
identical diff.

## Justifying a survivor

A surviving mutant is a claim that no test needs to pin the behaviour. That is
sometimes true. To accept one, add it to the relevant baseline `survivors`
array with a one-line reason and a tracking issue:

```json
{
  "file": "src/taxonomy.rs",
  "mutant": "replace `==` with `!=` in classify_failure",
  "reason": "Unreachable defensive branch; classified Unknown before comparison. See #1234.",
  "issue": 1234
}
```

The preferred fix is always a test that kills the mutant. Do not lower the
baseline to make a failure go away, and do not re-bless a survivor without a
reason.

## Running it locally

```bash
# Rust — whole critical set
cd contracts/crashlab-core
cargo install cargo-mutants --locked
cargo mutants --file src/taxonomy.rs --file src/fixture_classifier.rs \
  --file src/signature_hash.rs --file src/replay.rs --json > /tmp/mutants.json
node ../../scripts/mutation/check-mutants-baseline.mjs \
  --report /tmp/mutants.json \
  --baseline mutation-baseline.json --format cargo-mutants

# TypeScript
pnpm --dir apps/web add -D @stryker-mutator/core @stryker-mutator/vitest-runner
pnpm --dir apps/web exec stryker run
node scripts/mutation/check-mutants-baseline.mjs \
  --report apps/web/reports/mutation/mutation.json \
  --baseline apps/web/mutation-baseline.json --format stryker
```

`node --test scripts/mutation/` covers the parsing and baseline-diff logic
without needing either tool installed.
