# Nightly Health Runbook

This runbook describes how nightly workflows are monitored, triaged, and escalated.

Nightly workflows covered by this runbook:

- `fuzz-campaign.yml`
- `storage-minio.yml`
- `backlog-freshness.yml`
- `codeql.yml`
- `lighthouse.yml`

The `nightly-health.yml` workflow audits these nightlies daily, maintains the pinned **nightly health** issue, enforces the failure budget, and posts the weekly green/red table.

## Failure budget

Each nightly has a rolling 7-day red rate. The default budget is 50% red across at least two completed runs. When a nightly exceeds the budget:

1. The nightly health issue is labeled `priority:p0`.
2. Maintainers are notified through the nightly on-call channel.
3. The issue body is updated with the current red rate, failing run links, and last-green SHA.

The budget is configured via `steps.audit.env.FAILURE_BUDGET_PERCENT` in `nightly-health.yml`.

## Auto-triage

When a nightly fails, `nightly-health.yml` automatically:

1. Opens or updates the pinned nightly health issue (`label: nighty-health`).
2. Attaches the failing workflow run link, last-green SHA, and the rolling red rate.
3. Adds a comment with the audit run link.

The audit job supports a dry-run mode through `Workflow Dispatch` input `dry-run`: when set, the script logs the issue body and label changes it would make without creating or updating anything. Use this to validate triage output on a pull request.

## Known failure classes

Triage the failure class before assigning ownership.

| Class | Symptoms | First response |
| --- | --- | --- |
| Infra | Runner timeouts, rate limits, network errors, cloud provider outages, flaking dependency downloads | Re-run the failed job. If it passes, label the nightly health issue `nightly:infra` and note the run in the issue. If it repeats, escalate to infra on-call. |
| Product | Reproducible test failures, fuzz crashes, regressions in code paths, CodeQL findings, budget regressions | Label the issul `nightly:product`, link the failing run and logs, and assign the owning team. Do not silently re-run. |
| Failure budget breach | Red rate over threshold for 7 days | Treat as p0. Page the nightly on-call channel and open a follow-up task for the owning team. |

## Escalation

1. **Day 0**: nightly health issue is opened or updated automatically.
2. **Day 1**: on-call triages the failure class and assigns an owner.
3. **Day 2+*: if the nightly is still red or over budget, `priority:p0` is applied and the maintainer notification channel is pinged.
4. **Day 7+**: if the nightly has not returned to green, escalate to the engineering manager and include the weekly report in the incident thread.

## Weekly report

The `weekly-report` job in `nightly-health.yml` posts a green/red table per nightly for the last 28 days as a comment on the nightly health issue. It runs on the same daily schedule and can be triggered manually with `report-only: true`.

## Manual validation

To validate the automation on a pull request:

1. Run the `Nightly Health` workflow via `Workflow Dispatch` with `dry-run: true`.
2. Confirm the audit logs show the expected issue body and labels without creating or updating anything.
3. Run the workflow with `dry-run: false` on a test branch to confirm the issue is created and the comment is posted.
