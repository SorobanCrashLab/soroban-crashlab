---
name: "Frontend: Interactive Runbooks & Debugging Playbooks - Guided Response Steps, Evidence Capture, and Automation Handoffs"
description: "Deliver an in-app runbook/playbook system that guides responders through debugging and incident workflows with contextual steps, evidence capture, checklists, and automation integrations"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Operational and debugging knowledge lives in static docs and tribal memory, causing inconsistent response quality:
- Responders lack guided, context-aware steps during crash spikes, regressions, or integration failures
- Evidence collection (logs, traces, diffs, screenshots, decisions) is manual and incomplete
- No linkage between runbooks, incidents, triage items, and automation actions
- Playbooks become stale; usage/outcome feedback is not captured
- Different teams follow divergent procedures for similar failures

## Proposed Solution
Build **Interactive Runbooks & Debugging Playbooks**:
- Authorable playbook templates with conditional steps, roles, and expected outcomes
- Contextual launch from incidents, alerts, runs, regressions, and integration health views
- Execution mode with checklists, timers/SLA hints, evidence capture, and decision points
- Handoffs to automations (rerun, replay, pause campaign, notify, create issue) with approval gates
- Analytics on playbook usage, completion, and effectiveness

## Requirements
### Functional
- [ ] Playbook authoring/editing UI: steps, branching conditions, required evidence, role assignments, links
- [ ] Template library scoped by failure type/service/workspace with versioning and approvals
- [ ] Context-aware "start playbook" entry points from incidents/triage/runs/ops dashboards (#061/#066/#050)
- [ ] Execution tracker: step completion, assignees, notes, timers, blockers, and escalation prompts
- [ ] Evidence capture: attach logs/traces/diffs/artifacts/annotations and auto-fill incident timeline (#063/#069)
- [ ] Automation actions via workflow hooks with dry-run/confirmation and audit logging (#049/#070)
- [ ] Post-execution summary and feedback; suggest playbook improvements based on outcomes
- [ ] Searchable runbook catalog with freshness/staleness indicators

### Non-Functional
- [ ] Resumable executions with real-time collaboration updates (#002/#003)
- [ ] RBAC/ABAC enforcement for sensitive actions and template governance
- [ ] Accessible stepper/checklist UI and mobile-friendly read/execute mode (#039)
- [ ] Reliable persistence and export of execution records for postmortems

## Files to Modify / Create
```
apps/web/src/features/runbooks/
├── RunbookLibrary.tsx
├── RunbookEditor.tsx
├── RunbookExecution.tsx
├── StepChecklist.tsx
├── EvidenceCapturePanel.tsx
└── hooks/useRunbooks.ts

apps/web/src/app/runbooks/page.tsx
apps/web/src/app/runbooks/[id]/page.tsx
apps/web/src/app/api/runbooks/route.ts
apps/web/src/app/api/runbooks/executions/route.ts
docs/ops/interactive-runbooks-playbooks.md
```

## Acceptance Criteria
- Teams can execute guided, auditable playbooks from relevant operational/debug contexts
- Evidence and actions are captured consistently and linked to incidents/triage records
- Playbooks are governed, versioned, and measurable for effectiveness
- Works across desktop/mobile with proper permissions and accessibility

## PR Guide
- Branch: `issue/080-frontend-runbook-automation-playbooks`
- Phase 1: template model + library/editor + execution tracker
- Phase 2: contextual launches + evidence capture + timeline links
- Phase 3: automation handoffs + approvals + analytics
- Phase 4: governance, a11y/mobile, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
