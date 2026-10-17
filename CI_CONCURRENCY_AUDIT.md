# CI Concurrency, Caching, and Concurrency-Policy Hygiene

Status: **executed** (concurrency groups and cache-key hygiene applied across all workflows).

This document records the before/after state of every workflow under `.github/workflows/*.yml`.

The goal of the sweep:

1. Every workflow declares a `concurrency` block with a consistent group name of the form  
   `ci-<workflow>-<ref>`.
2. PR workflows cancel superseded runs (`cancel-in-progress: true`).
3. Main-branch pushes do not cancel each other silently (`cancel-in-progress: false`).
4. Cache keys include lockfile hash + OS + toolchain version, with documented `restore-keys` fallbacks.
5. No cache write from untrusted forks to shared keys.
6. A lint fails CI when a workflow lacks a concurrency block.

## Conventions

### Concurrency group naming

```
ci-<workflow-name>-<ref>
```

Where:
- `<workflow-name>`: stable key derived from the workflow file name (e.g. `tests`, `lint`, `semantic-pr`).
- `<ref>`: `github.ref` for PR workflows, or the branch name for push workflows.

Properties:
- PR workflows: `cancel-in-progress: true` — superseded commits are cancelled.
- Main push workflows: `cancel-in-progress: false` — main pushes are never silently cancelled.
- Scheduled workflows: `cancel-in-progress: false` — scheduled runs are independent.

### Cache key format

```
<tool>-<os>-<toolchain-version>-<lockfile-hash>
```

- `tool`: e.g. `node`, `pip`, `cargo`, `go`.
- `os`: `linux`, `macos`, `windows`.
- `toolchain-version`: version pinned in the workflow (e.g. `node-version` input).
- `lockfile-hash`: `${{ hashFiles('../lockfile') }}`.

`restore-keys` fallbacks (documented per cache):

```
restore-keys: |
  <tool>-<os>-<toolchain-version>-
  <tool>-<os>-
```

No cache write from untrusted forks: cache writes are gated on `event.name == 'push'` or `trused boolean` checks so fork PRs only restore.

## Per-workflow before/after

The following table summarizes the audited state and the applied fix for each workflow. "Before" describes the audited behavior; "After" describes the applied concurrency group and cache key policy.

| Workflow | Before (audited) | After (applied) |
| --- | --- | --- |
| `ci.yml` | No concurrency block; cache key branch-scoped without restore-keys | `concurrency: ci-ci-${{ github.ref }}`, cancel-in-progress true on PR, false on main; cache key includes lockfile hash + OS + toolchain version, restore-keys documented |
| `tests.yml` | Missing concurrency; unkeyed cache (`node-modules`)  | `concurrency: ci-tests-${{ github.ref }}`, cancel-in-progress true on PR, false on main; cache key `hashFiles(`lockfile`)` |
| `lint.yml` | No concurrency; no cache | `concurrency: ci-lint-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `semantic-pr.yml` | No concurrency; no cache | `concurrency: ci-semantic-pr-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `release.yml` | No concurrency; branch-scoped cache without restore-keys | `concurrency: ci-release-${{ github.ref }}`, cancel-in-progress false; cache key includes lockfile hash + OS + toolchain version, restore-keys documented |
| `deploy.yml` | No concurrency; shared cache key across environments | `concurrency: ci-deploy-${{ github.ref }}`, cancel-in-progress false; cache key includes environment + lockfile hash + OS + toolchain version |
| `security-yml` | No concurrency; unkeyed cache | `concurrency: ci-security-${{ github.ref }}`, cancel-in-progress true on PR, false on main; cache key includes lockfile hash + OS + toolchain version |
| `codeql.yml` | No concurrency; no cache | `concurrency: ci-codeql-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `docs.yml` | No concurrency; branch-scoped cache without restore-keys | `concurrency: ci-docs-${{ github.ref }}`, cancel-in-progress true on PR, false on main; cache key includes lockfile hash + OS + toolchain version, restore-keys documented |
| `benchmarks.yml` | No concurrency; unkeyed cache | `concurrency: ci-benchmarks-${{ github.ref }}`, cancel-in-progress true on PR, false on main; cache key includes lockfile hash + OS + toolchain version |
| `nightly.yml` | No concurrency; no cache | `concurrency: ci-nightly-${{ github.ref }}`, cancel-in-progress false |
| `code-scan.yql` | No concurrency; no cache | `concurrency: ci-code-scan-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `dependabot.yml` | No concurrency; no cache | `concurrency: ci-dependabot-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `stale.yml` | No concurrency; no cache | `concurrency: ci-stale-${{ github.ref }}`, cancel-in-progress false |
| `contrib-setup.yml` | No concurrency; no cache | `concurrency: ci-contrib-setup-${{ github.ref }}`, cancel-in-progress true on PR, false on main |
| `ci-concurrency-lint.yml` | New workflow | `concurrency: ci-ci-concurrency-lint-${{ github.ref }}`, cancel-in-progress true on PR, false on main; fails when a workflow lacks a concurrency block |

## Cache key collision evidence

Collision checks are enforced by including the following discriminators in every cache key:
- OS (`runner.os`)
- Toolchain version (pinned version input)
- Lockfile hash (`hashFiles(../lockfile)`)
- Environment (for deploy workflows)

This prevents collisions across branches, OSs, toolchain bumps, and environments. PR discussion must include the key formats and the collision analysis before merge.

## Concurrency lint

The workflow `.github/workflows/ci-concurrency-lint.yml` runs `scripts/ci-concurrency-lint.sh`, which fails when any workflow file is missing a `concurrency` block. This ensures future workflows cannot regress the policy.

## Measurement

Before/after metrics (cancelled-run rate and mean queue time) are attached to the PR description and collected from the Actions API for the same window of runs before and after this change.
