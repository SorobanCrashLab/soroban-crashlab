---
name: "Frontend: Incident Command Center - Unified Incident Timeline, War Room, Ownership, and Postmortem Workflow"
description: "Create an incident command center that correlates alerts, regressions, campaign failures, and integration outages into actionable incidents with timelines, ownership, communication, and postmortem tracking"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Operational issues (crash spikes, regression bursts, webhook delivery failures, queue backlogs, integration outages) are detected in separate surfaces without a unified incident response workflow.

Gaps:
- No incident entity/timeline aggregating signals across runs, campaigns, integrations, and alerts
- No command-center view for severity, ownership, status, and mitigation actions
- Weak coordination between on-call notifications (#013/#041), automation (#049), and ops dashboards (#050)
- No structured postmortem capture linked to evidence and corrective actions

## Proposed Solution

Implement an **Incident Command Center**:
- Incident lifecycle management (detected, acknowledged, mitigating, resolved, postmortem)
- Correlated timeline from audit/events/alerts/webhooks/traces with impact scope
- War-room workspace: owners, tasks, status updates, comms links, related runs/campaigns
- Postmortem workflow with templates, action items, and follow-up tracking

## Requirements

### Functional
- [ ] Incident creation (manual + automated from alert rules) with severity, impact, services/components
- [ ] Incident list/board with filters (status, severity, owner, service, age) and SLA indicators
- [ ] Unified timeline correlating alerts, run failures, regressions, deployment markers, webhook/integration events
- [ ] Ownership and coordination: assignees, responders, status updates, task checklist
- [ ] Mitigation actions: link to automation rules, pause campaigns, mute alerts, rollback config references
- [ ] Postmortem templates, timeline export, root-cause/contributing factors, corrective actions with owners/due dates
- [ ] Deep links to run detail, triage board, audit explorer, traces, and integration health views
- [ ] Permissions and audit logging for incident state changes and communications metadata

### Non-Functional
- [ ] Real-time incident updates via SSE (#002) with <2s propagation for key events
- [ ] Timeline rendering performant for 10k+ correlated events (virtualized)
- [ ] Resilient to partial telemetry outages (graceful degradation and source status indicators)
- [ ] Accessible layouts and keyboard-operable board/timeline interactions

## Files to Modify / Create
```
apps/web/src/features/incidents/
├── IncidentCommandCenter.tsx
├── IncidentList.tsx
├── IncidentDetail.tsx
├── IncidentTimeline.tsx
├── WarRoomPanel.tsx
├── PostmortemEditor.tsx
├── correlation/
│   └── correlator.ts
└── hooks/useIncidents.ts

apps/web/src/app/incidents/
├── page.tsx
├── [id]/page.tsx
└── [id]/postmortem/page.tsx

apps/web/src/app/api/incidents/
├── route.ts
├── [id]/route.ts
├── [id]/timeline/route.ts
└── [id]/postmortem/route.ts
docs/ops/incident-command-center.md
```

## Acceptance Criteria
- Incidents can be created, triaged, mitigated, resolved, and documented in-app
- Correlated timeline provides actionable cross-system context
- Postmortems link evidence and track corrective actions to completion
- Real-time updates and access controls verified

## PR Guide
- Branch: `issue/066-frontend-incident-command-center`
- Phase 1: Incident model + list/detail + lifecycle
- Phase 2: Correlated timeline + war room coordination
- Phase 3: Postmortem workflow + action tracking
- Phase 4: Integrations, real-time updates, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)