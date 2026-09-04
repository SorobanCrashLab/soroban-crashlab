# CI Concurrency Audit

CI and PR feedback workflows use a group composed of the workflow name and
the pull request number (or ref). Pull request runs set `cancel-in-progress`
to `true`; push runs for `main` set it to `false`. The workflow name prevents
one workflow from cancelling another workflow's run.

## Workflow decisions

| Workflow | Decision | Rationale |
| --- | --- | --- |
| `ci.yml` | Apply | Full PR CI is superseded by a newer push; `main` pushes are never cancelled. |
| `validate-casebundle.yml` | Apply | Path-scoped PR validation is iteration feedback and is safe to supersede. |
| `lighthouse.yml` | Apply | A newer PR revision supersedes the previous performance audit and comment. |
| `vercel-preview.yml` | Apply | Only the newest preview deployment is useful for a PR revision. |
| `size-limit.yml` | Apply | The budget check evaluates the newest PR contents. |
| `guard-dependabot.yml` | Skip | `pull_request_target` automation has side effects and is not a push iteration check. |
| `storage-minio.yml` | Skip | Nightly/on-demand contract verification is independent of branch pushes. |
| `stale.yml` | Skip | Scheduled issue maintenance should complete independently. |
| `backlog-freshness.yml` | Skip | Scheduled reporting is not superseded by branch revisions. |

## Required checks and verification

Cancellation marks the superseded run as cancelled rather than successful.
Required checks should therefore be configured against the check name produced
by the replacement run, not against a cancelled run's conclusion. A cancelled
superseded run must not be treated as evidence that the replacement run passed;
the replacement run remains the authoritative result for the same PR head.

The repository does not dispatch workflows or push branches from this change,
so no live burst-test evidence links are claimed here. Verification for
deployment should use two rapid pushes to one PR branch, confirm the first run
is cancelled, confirm the second run completes, and confirm a `main` push is
not cancelled by a later `main` push.