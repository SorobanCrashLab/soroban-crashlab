# Reading the regression summary

Every pull request runs the **Regression Test Suite** workflow. Besides
`cargo test`, it replays the shipped fixtures
(`contracts/crashlab-core/fixtures/regression_suite.json`) and compares each
result against the baseline of known failures. The outcome shows up in three
places:

- a **sticky PR comment** that is edited in place on every run, so there is one
  per PR rather than one per push;
- the **CrashLab regression summary** check run, plus the job summary at the top
  of the workflow run;
- the dashboard, under **Integrations → CI replay**, when the deployment
  accepts CI results (see [Posting results to the dashboard](#posting-results-to-the-dashboard)).

## What the classifications mean

Each fixture is identified as `seed-<seed id>-<mode>`. Its *signature* is the
failure class it actually produced, or `error` if it could not be replayed.

| Classification | Meaning | Blocks the PR? |
|---|---|---|
| **New** | The fixture fails, and the baseline does not list it with this signature. Either it is a new failure, or a known failure whose signature changed. | Yes |
| **Recurring** | The fixture fails with exactly the signature recorded in the baseline. | No |
| **Fixed** | The baseline lists the fixture as failing, but it passes now. | No. Remove it from the baseline. |
| **Unchanged** | The fixture passes and is not in the baseline. | No |

Only **new** failures fail the gate. The comment lists each one with its
expected and actual class, plus the command to reproduce it locally:

```bash
cd contracts && cargo run --release --bin crashlab -- regression-suite crashlab-core/fixtures/regression_suite.json
```

Add `--report report.json` to get the same per-fixture JSON that CI classifies.

## Updating the baseline

The baseline is `contracts/crashlab-core/regression-baseline.json`:

```json
{
  "schema": 1,
  "knownFailures": [
    { "fixture": "seed-7-invoker", "signature": "empty-input", "reason": "why this is accepted, ideally with an issue link" }
  ]
}
```

- **You fixed a known failure.** The summary lists it under *Fixed*. Delete its
  entry from `knownFailures` in the same PR, so a later regression shows up as
  *new* again.
- **Your PR intentionally changes a fixture's behaviour.** Prefer updating the
  fixture's expected `failure_class` in `regression_suite.json`. Add a
  baseline entry only for a failure that is accepted for now, and give the
  reason.
- **A known failure changed signature.** It is reported as *new* and shows the
  baseline signature in brackets. Investigate it; if the new signature is
  accepted, update the entry's `signature`.

Changes to the baseline are reviewed like code. A baseline entry is a decision
to ship a known failure.

## When the comment is missing

Posting is **report-only**: if posting fails, the step logs a warning and the
gate is unaffected. The common case is a pull request from a fork. GitHub gives
fork PRs a read-only token, so the sticky comment and check run cannot be
written. The job summary on the workflow run always has the same numbers, and
the `regression-results` artifact contains `summary.md` and `ci-result.json`.

## Posting results to the dashboard

Maintainers enable this once per deployment:

1. Create an API token with the **CI results (write)** (`ci:write`) scope under
   *Settings → API*.
2. In the repository settings, add the secret `CRASHLAB_CI_TOKEN` (the token)
   and the variable `CRASHLAB_API_URL` (the deployment's base URL).
3. On the deployment, set `CRASHLAB_CI_REPOSITORY=<owner>/<repo>`.

Pull requests, pushes to `main` and the nightly scheduled run then post one
result per commit and suite run to `POST /api/integrations/ci/results`. A run
that is retried with the same payload is replayed rather than duplicated. A
re-run attempt is a separate suite run.

### Trust model

- Only workflows that hold the `ci:write` token can post. GitHub does not
  expose repository secrets to fork pull requests, so fork code cannot post.
- `CRASHLAB_CI_REPOSITORY` pins results to one repository, so a token copied
  into another repository's workflow is rejected (`403
  CI_REPOSITORY_NOT_ALLOWED`).
- The server validates every field, requires each fixture's classification to
  agree with its outcome, recomputes the delta counts itself, and rate-limits
  posts per credential (`429 RATE_LIMITED`).
- A token is a bearer credential. Rotate it under *Settings → API* if it
  leaks. GitHub OIDC (short-lived, repository-bound credentials) is the planned
  replacement.

### Report-only phase and the flip point

Today, a failed dashboard post only logs a warning. Once the dashboard is the
system of record, set the repository variable `CRASHLAB_CI_REPORT_STRICT=true`.
A failed post then fails the publish step. The regression gate itself is
always decided by the classification, never by whether posting worked.
