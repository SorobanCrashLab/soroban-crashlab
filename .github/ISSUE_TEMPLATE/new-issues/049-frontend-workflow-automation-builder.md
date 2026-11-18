---
name: "Frontend: Workflow Automation Builder - No-Code/Low-Code Rules for Triage, Alerts, Integrations & Campaign Actions"
description: "Build a visual workflow automation builder to create event-driven rules (triggers, conditions, actions) for triage, notifications, integrations, and campaign operations with testing and auditability"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Users must manually respond to recurring events (new crash types, regression detected, webhook failures, campaign thresholds). There is no unified automation system to codify operational responses.

Issues:
- No rule engine UI for event-driven workflows
- Repetitive triage/notification/integration actions done manually
- No safe way to test automation rules before enabling
- No visibility into rule executions, failures, or audit trail

## Proposed Solution

Implement a **Workflow Automation Builder**:
- Visual rule builder: Trigger -> Conditions -> Actions
- Supported triggers: crash/regression events, campaign state, webhook/integration events, schedules
- Actions: tag/assign/link issue, notify (Slack/email/webhook), pause campaign, create ticket, run replay
- Rule simulation/testing, versioning, execution logs, and RBAC/audit controls

## Requirements

### Functional
- [ ] Visual rule editor with trigger/condition/action blocks and validation
- [ ] Trigger catalog: run/crash events, regression detected/fixed, threshold breaches, integration failures, schedules
- [ ] Condition builder: field comparisons, filters, thresholds, time windows, dedup/suppression windows
- [ ] Action catalog: triage updates, notifications (#041/#013), webhook dispatch (#011/#015), campaign controls (#037)
- [ ] Rule testing/simulation against historical/sample events with dry-run output
- [ ] Rule lifecycle: draft, enabled, paused, version history, rollback
- [ ] Execution logs with inputs/outputs/errors and replay of failed executions
- [ ] Permission-aware editing/execution and audit trail for rule changes

### Non-Functional
- [ ] Rule evaluation latency compatible with near-real-time events
- [ ] Safe execution limits (rate limits, loop prevention, max actions)
- [ ] Deterministic condition evaluation and idempotent action handling where possible
- [ ] Accessible visual editor and keyboard-operable controls

## Files to Modify / Create
```
apps/web/src/features/automation/
├── builder/
│   ├── WorkflowBuilder.tsx
│   ├── nodes/
│   ├── palette/
│   └── validation.ts
├── rules/
│   ├── RuleList.tsx
│   ├── RuleEditor.tsx
│   ├── RuleVersions.tsx
│   └── RuleSimulator.tsx
├── executions/
│   ├── ExecutionLog.tsx
│   └── ExecutionDetail.tsx
└── hooks/useAutomation.ts

apps/web/src/app/automation/
├── page.tsx
├── [ruleId]/page.tsx
└── executions/page.tsx

apps/web/src/app/api/automation/
├── rules/route.ts
├── simulate/route.ts
├── executions/route.ts
└── triggers/route.ts
```

## Acceptance Criteria
- Users can create, test, enable, and monitor automation rules end-to-end
- Rules execute correctly on supported events with logs and failure handling
- Loop/rate safeguards prevent runaway automation
- Changes and executions are auditable and permission-controlled

## PR Guide
- Branch: `issue/049-frontend-workflow-automation`
- Phase 1: Rule model + builder UI + CRUD
- Phase 2: Trigger/condition/action execution integration
- Phase 3: Simulation, versioning, execution logs
- Phase 4: Safety controls, RBAC/audit, docs/tests
- Depends on event/webhook/notification foundations (#011, #034, #041)

**Estimated effort:** 6-8 weeks (200 pts)