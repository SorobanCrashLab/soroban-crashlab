# Dependency audit triage policy (#1563)

## Mode

The `.github/workflows/dependency-audit.yml` workflow runs in **report-only mode**
by default:

- `pnpm audit --audit-level high` over `apps/web` (`pnpm-lock.yaml`)
- `cargo deny check advisories` over `contracts/` (`contracts/Cargo.lock`)
- `osv-scanner` over both lockfiles (cross-ecosystem OSV gate)

Findings are converted to SARIF and uploaded to the GitHub Security
(code-scanning) tab. The job intentionally never fails on findings while
report-only is on, so it stays green on PRs during triage.

## Triaging findings

- **Who dismisses:** the on-call engineer / security steward for the week
  (see `docs/ops/oncall.md`). Dismissals are recorded as code-scanning
  dismissals with a reason and a link to the tracking issue.
- **When to pin:** if a vulnerable dependency has no patched version, pin it
  at the current safe version and record the exception with an expiry date.
- **When to flip to failing:** once the baseline is accepted and
  critical/high findings have triaged exceptions, enable
  `workflow_dispatch.inputs.fail` (or set `REPORT_ONLY=false`) so the job
  fails on high/critical findings.

## Scanners

| Scanner | Target | Lockfile |
|---------|--------|----------|
| `pnpm audit --audit-level high` | `apps/web` (npm) | `pnpm-lock.yaml` |
| `cargo deny check advisories` | `contracts/` (Rust) | `contracts/Cargo.lock` |
| `osv-scanner` | both ecosystems | `pnpm-lock.yaml`, `contracts/Cargo.lock` |

## Dependabot

The `cargo` ecosystem is enabled for `/contracts` in `.github/dependabot.yml`
so advisory-driven Rust bumps arrive. It is inert while
`open-pull-requests-limit: 0` stands (same as the `npm` and `github-actions`
ecosystems).
