# On-call runbook: alert routing

Routing is policy-as-code in [`ops/alert-policies.yml`](../../ops/alert-policies.yml)
(#1892). The schema — including "the last route is a catch-all" and "escalation
never starts before the ack SLA" — is enforced by
`apps/web/src/lib/notifications/alert-policy.test.ts` in the
`governance-suites` workflow on every PR that touches the policy.

## Lifecycle

```
trigger ──► acknowledged ──► resolved
   │              ▲               ▲
   │  (ack in dashboard or PagerDuty — both directions sync)
   │                              │
   └─ unacked past ack SLA ─► escalation steps
   └─ condition clears ─────► auto-resolved, "Recovered: <note>"
```

- **Dedup.** An identical alert (same route + dedup key fields) within the
  route's window updates the open incident (`occurrences` goes up) instead of
  opening a new one. Fifty identical crashes are one page.
- **Ack.** From the dashboard: `POST /api/integrations/pagerduty/alerts`
  `{ "action": "acknowledge", "id": "<incident>" }` — pushed to every channel
  on the route. From PagerDuty: the v3 webhook updates the dashboard; it is not
  echoed back to PagerDuty.
- **Escalation.** `{ "action": "tick" }` (run every minute from cron) fires each
  escalation step once the incident has been unacknowledged for
  `afterMinutes`, and releases notifications held by quiet hours.
- **Auto-resolve.** Producers send `{ "action": "clear", "dedupKey", "note" }`
  when the condition recovers; the incident resolves with
  `Recovered: <note>`.
- **Quiet hours** (22:00–07:00 UTC) hold notifications only for routes with
  `respectQuietHours: true`. Paging routes ignore them.

## Routes

### `nightly-critical` — nightly escalation, critical (pages)

Source: W5-D08 nightly campaign escalation. A crash the nightly run could not
auto-triage.

- **Ack within 10 min.** Escalates to PagerDuty + email at 10 min, email at 30.
- Open the run from the alert's fingerprint and replay it from the run page
  (`POST /api/runs/<id>/replay`) to confirm it reproduces.
- Reproduces → file via the run's "Create issue" action, then resolve the
  incident with the issue link as the note.
- Does not reproduce → mark flaky (ADR 0005), resolve with "flaky".

### `slo-fast-burn` — SLO burn, critical/error (pages)

Source: W5-I02 SLO burn-rate alerts. Error budget will be exhausted within hours.

- **Ack within 15 min**; escalates to email at 15 min.
- Check the SLO dashboard for the affected objective; correlate with the last
  deploy (Vercel) and runner health (`/api/health`).
- Roll back if a deploy correlates. The alert auto-resolves when burn drops.

### `slo-slow-burn` — SLO burn, warning/info (chat)

- Slack only, 2 h dedup window, respects quiet hours, no escalation.
- Triage next working day; open a ticket if the trend continues for a week.

### `catch-all` — everything else (chat)

- Slack only; escalates to email after 60 min unacknowledged.
- If a producer lands here routinely, give it a route of its own.

## Changing the policy

1. Edit `ops/alert-policies.yml`; keep `catch-all` last.
2. `pnpm --dir apps/web exec vitest run src/lib/notifications` — the routing
   matrix test lists the expected route per source × severity; update it with
   the intended change.
3. Note the change in the PR and update this runbook's route section.

## Maintainer setup (credentials)

No credentials are committed. Set in Vercel / deployment secrets:

| Variable | Purpose |
|---|---|
| `PAGERDUTY_INTEGRATION_KEY` | Events API v2 routing key (trigger/ack/resolve) |
| `PAGERDUTY_WEBHOOK_SECRET` | Signing secret of the v3 webhook subscription pointed at `/api/integrations/pagerduty/webhook` (events: `incident.acknowledged`, `incident.resolved`) |
| `ALERT_SLACK_WEBHOOK_URL` | Slack incoming webhook for routed alerts |
| `ALERT_EMAIL_TO` | Escalation recipients (uses the SMTP integration config) |
| `ALERT_POLICY_PATH` | Optional override of the policy file location |

A channel without credentials logs a warning and is skipped; the other
channels on the route still fire.
