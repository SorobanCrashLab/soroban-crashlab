---
name: "Frontend: Campaign Management Console - Creation, Scheduling, Templates, Monitoring & Lifecycle Controls"
description: "Deliver a full campaign management UI for creating/configuring fuzzing campaigns, templates, schedules, budgets, lifecycle actions, and live monitoring in one cohesive console"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Campaign workflows are spread across forms, pages, and utilities (`apps/web/src/app/campaigns/`, `CampaignConfigForm.tsx`, schedules, comparison, cost estimator) with gaps:
- No guided campaign creation/editing experience with validation and presets
- Limited scheduling/recurrence and budget controls in UI
- Poor visibility into campaign lifecycle, queue, progress, and health
- No template library for reusable campaign configurations

## Proposed Solution

Build a **Campaign Management Console**:
- Guided wizard + advanced editor for campaign configuration
- Template library (create, version, share, apply)
- Scheduling/recurrence, budget/cost estimation, and guardrails
- Lifecycle controls (start/pause/resume/stop/clone/archive) with confirmations
- Live campaign health and progress views integrated with #017

## Requirements

### Functional
- [ ] Campaign list with filters, saved views, bulk actions, and status indicators
- [ ] Guided create/edit wizard with validation, presets, and diff-before-save
- [ ] Template management: save/apply/version/duplicate/share templates
- [ ] Scheduling UI: cron/interval, timezone-aware, blackout windows, next-run preview
- [ ] Budget controls: run limits, time/cost caps, auto-stop policies
- [ ] Lifecycle actions with RBAC checks and audit logging hooks
- [ ] Campaign detail: config, runs, metrics, alerts, history, linked regressions
- [ ] Clone/compare campaigns and promote template from successful campaign

### Non-Functional
- [ ] Form performance smooth with large configs (100+ fields/options)
- [ ] Optimistic UI with rollback on failure for lifecycle actions
- [ ] Accessible forms/wizards (labels, errors, focus management)
- [ ] URL-addressable campaign views and tabs

## Files to Modify / Create
```
apps/web/src/features/campaigns/
├── CampaignConsole.tsx
├── list/CampaignList.tsx
├── wizard/CampaignWizard.tsx
├── editor/CampaignEditor.tsx
├── templates/TemplateLibrary.tsx
├── scheduling/ScheduleEditor.tsx
├── budget/BudgetControls.tsx
├── detail/CampaignDetail.tsx
├── lifecycle/actions.ts
└── hooks/useCampaignConsole.ts

apps/web/src/app/campaigns/ (refactor pages)
apps/web/src/app/api/campaigns/ (enhance CRUD/schedule/templates)
apps/web/src/app/CampaignConfigForm.tsx (migrate)
```

## Acceptance Criteria
- Users can create, schedule, monitor, and manage campaigns end-to-end in UI
- Templates and schedules are reusable and validated
- Lifecycle actions are permission-aware and auditable
- Campaign detail provides actionable health/progress insights

## PR Guide
- Branch: `issue/037-frontend-campaign-console`
- Phase 1: List/detail + CRUD refactor
- Phase 2: Wizard/editor + validation + templates
- Phase 3: Scheduling/budgets/lifecycle actions
- Phase 4: Monitoring integration + polish/tests

**Estimated effort:** 5-6 weeks (200 pts)