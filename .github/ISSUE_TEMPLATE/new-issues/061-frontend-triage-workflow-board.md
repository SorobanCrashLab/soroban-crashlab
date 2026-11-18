---
name: "Frontend: Triage Workflow Board - Kanban Operations, SLA Tracking, Assignment Rules & Automation Hooks"
description: "Build a production-grade triage workflow board for crashes and regressions with Kanban states, ownership, SLA timers, queue prioritization, and automation hooks integrated with runs and issue tracking"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Triage workflows are distributed across run detail pages, regression views, and ad-hoc actions. There is no unified operational board to manage crash triage at scale.

Current gaps:
- No Kanban-style workflow (New → Investigating → Reproduced → Fixing → Verified → Closed)
- No SLA tracking/escalation for critical regressions or untriaged crashes
- Manual assignment and prioritization without workload/rule support
- Limited linkage between triage state, run evidence, and external issues
- No bulk triage operations or automation integration for recurring patterns

## Proposed Solution

Implement a **Triage Workflow Board** with:
- Configurable workflow states, transitions, and required fields per transition
- Kanban/list views with filters (campaign, severity, exploitability, age, owner, signature cluster)
- SLA timers, breach indicators, escalation hooks, and queue prioritization scoring
- Assignment management (manual, round-robin suggestions, team queues)
- Deep integration with crash intelligence (#021), regression detection (#018), bulk actions (#051), and workflow automation (#049)

## Requirements

### Functional
- [ ] Configurable triage workflow states, transitions, and transition guards (e.g., "reproduced" requires linked run/artifact)
- [ ] Kanban board and table view with drag-drop transitions (permission-aware)
- [ ] Triage item model linking crash signature/cluster, representative runs, regressions, artifacts, and external issues
- [ ] SLA policies by severity/campaign with timers, breach badges, and escalation events
- [ ] Assignment features: owner/team, workload hints, reassignment history, mention/notification hooks (#041)
- [ ] Prioritization scoring (severity, frequency, novelty, customer impact, regression age) with explainability
- [ ] Bulk triage actions (assign, tag, state change, link issue, suppress) with preflight and audit
- [ ] Saved views and shareable board states (#052/#056)

### Non-Functional
- [ ] Board handles 10k+ triage items with virtualization and server-side filtering
- [ ] State transitions idempotent and auditable; optimistic UI with rollback
- [ ] Real-time updates for assignment/state/SLA changes via SSE (#002)
- [ ] Full keyboard accessibility for Kanban operations and screen reader announcements

## Files to Modify / Create
```
apps/web/src/features/triage/board/
├── TriageBoard.tsx
├── TriageTableView.tsx
├── columns/
├── cards/TriageCard.tsx
├── workflow/
│   ├── stateMachine.ts
│   ├── transitions.ts
│   └── guards.ts
├── sla/
│   ├── SlaPolicyEngine.ts
│   ├── SlaBadge.tsx
│   └── timers.ts
├── prioritization/
│   ├── scoring.ts
│   └── explain.ts
└── hooks/
    ├── useTriageBoard.ts
    └── useTriageSla.ts

apps/web/src/app/triage/ (enhance board routes/views)
apps/web/src/app/api/triage/
├── board/route.ts
├── items/route.ts
├── transitions/route.ts
└── sla/route.ts
docs/triage/workflow-board.md
```

## Acceptance Criteria
- Teams can manage crash/regression triage end-to-end from a unified board
- SLA breaches and escalations are visible and trigger configured notifications/automation
- Workflow transitions enforce required evidence and are fully audited
- Board remains performant and accessible at scale

## PR Guide
- Branch: `issue/061-frontend-triage-workflow-board`
- Phase 1: Workflow/state model + board/table UI
- Phase 2: SLA/prioritization + assignment
- Phase 3: Real-time updates + bulk actions + saved views
- Phase 4: Integrations (regressions/crash intelligence/issues) + tests/docs
- Coordinate with #018, #021, #041, #049, #051

**Estimated effort:** 5-6 weeks (200 pts)