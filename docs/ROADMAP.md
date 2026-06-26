# Roadmap

Milestone-based issue tracking for Soroban CrashLab. Each milestone groups issues by product phase. The upstream repository ([SorobanCrashLab/soroban-crashlab](https://github.com/SorobanCrashLab/soroban-crashlab)) tracks execution across all milestones.

## Milestones

| Milestone | Issues | Status | Description |
|-----------|--------|--------|-------------|
| [P0 Foundation](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P0+Foundation%22) | 15 | Complete | Core fuzzing engine: classify, seed mutation, auth matrix, runner trait |
| [P1 Data bridge](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P1+Data+bridge%22) | 30 | Complete | Rust- Next.js data bridge: CLI export, API routes, client fetch |
| [P2 Product UI](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P2+Product+UI%22) | 35 | Complete | Dashboard pages: analytics, triage, settings, trends, run detail |
| [P3 Integrations](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P3+Integrations%22) | 35 | Complete | Webhooks, Sentry, Prometheus, issue trackers, alerting |
| [P4 Hardening](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P4+Hardening%22) | 20 | In progress (18/20) | Fuzz sandbox, timeout policies, flaky detection, CLI polish |
| [P5 Documentation](https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+milestone%3A%22P5+Documentation%22) | 5 | In progress (0/5) | VISION, CONTRIBUTING, API, ENV, and this ROADMAP index |

## Issue format

Every roadmap issue follows the same structure:

- **Branch:** `issue/<roadmap-id>-<slug>` (e.g. `issue/140-roadmap-index-md`)
- **PR title:** `type(area): short summary (ROADMAP-NNN)` using [Conventional Commits](https://www.conventionalcommits.org/)
- **Scope:** one issue per PR; do not commit `pnpm-lock.yaml` or `package-lock.json`
- **Tracking:** linked via `Closes #<issue_number>` in the PR body

## Catalog

The full issue catalog is generated from `scripts/roadmap/generate_catalog.py` and published as `scripts/roadmap/issues.json`.

For maintainers: run `scripts/roadmap/create_labels.sh` then `scripts/roadmap/create_github_issues.sh` to publish new roadmap batches.
