# Triage Workflow Board (WIP)

Tracks issue #2282. This is an early scaffold, not a complete implementation.

## Status

- [x] Basic workflow state machine (`new → investigating → reproduced → fixing → verified → closed`)
- [x] Transition guards (stub: `reproduced` requires linked run + artifact)
- [x] SLA timer/policy stubs with default response-time thresholds per severity
- [x] Prioritization scoring stub with explainability breakdown
- [x] Placeholder board/table view components and API route stubs (all return `501`)
- [ ] Kanban drag-and-drop, permission-aware transitions
- [ ] Real triage item persistence and linkage to runs/regressions/artifacts/issues
- [ ] Assignment management, round-robin suggestions, workload hints
- [ ] Bulk triage actions with preflight/audit
- [ ] Saved/shareable board views
- [ ] Real-time updates via SSE
- [ ] Virtualization for 10k+ items
- [ ] Accessibility pass for keyboard/screen-reader Kanban operations

## Code

- `apps/web/src/features/triage/board/` — workflow, SLA, and prioritization logic stubs plus
  placeholder board/table components.
- `apps/web/src/app/api/triage/{board,items,transitions,sla}/route.ts` — route stubs returning
  `501 Not Implemented` until backed by real persistence.

See the full requirements in issue #2282.
