# Incident Command Center (WIP)

Tracks issue #2286. This is an early scaffold, not a complete implementation.

## Status

- [x] Incident list/detail component stubs with lifecycle status field
- [x] Timeline correlator stub (currently just sorts events by time; no real
      alert/run/regression/deployment/webhook correlation yet)
- [x] War room panel and postmortem editor stubs
- [x] `/incidents`, `/incidents/[id]`, `/incidents/[id]/postmortem` placeholder routes
- [x] `incidents`, `incidents/[id]`, `incidents/[id]/timeline`, `incidents/[id]/postmortem`
      API route stubs (return `501`)
- [ ] Automated incident creation from alert rules
- [ ] Real cross-system correlation (alerts/runs/regressions/deployments/webhooks)
- [ ] Ownership, task checklist, mitigation actions (pause campaigns, mute alerts, rollback refs)
- [ ] Postmortem templates, corrective-action tracking with owners/due dates
- [ ] Deep links to run detail, triage board, audit explorer, traces
- [ ] Real-time updates via SSE
- [ ] Virtualized timeline for 10k+ events

## Code

- `apps/web/src/features/incidents/`
- `apps/web/src/app/incidents/`
- `apps/web/src/app/api/incidents/`

See the full requirements in issue #2286.
