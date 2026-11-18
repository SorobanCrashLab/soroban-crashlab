---
name: "Frontend: Onboarding & Adoption Journeys - Guided Setup, Sample Data, Activation Checklists & Contextual Education"
description: "Build a first-class onboarding and adoption experience with guided setup, sample campaign/run data, activation checklists, contextual education, and role-based journeys for new users and teams"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

New users face a steep learning curve: the platform has powerful fuzzing, triage, replay, and integration capabilities but limited guided onboarding. Current `onboarding/` and `onboarding-wizard/` surfaces are minimal and do not drive activation.

Pain points:
- No role-based onboarding (developer, security engineer, maintainer, operator)
- No sample data/demo mode for exploring features without running a campaign
- No activation checklist (connect repo/integration, run first campaign, triage first crash)
- Contextual help is sparse; users must read docs outside the product
- No progress persistence or team onboarding visibility

## Proposed Solution

Implement a comprehensive **Onboarding & Adoption Platform**:
- Role-based guided journeys with progressive disclosure
- Demo workspace/sample dataset (runs, crashes, regressions, integrations) with reset capability
- Activation checklist with completion tracking and contextual CTAs
- Inline product education (tooltips, walkthroughs, "learn more" panels) tied to real UI states
- Team onboarding admin view (adoption metrics, blockers, completion rates)

## Requirements

### Functional
- [ ] Role selection and personalized onboarding paths (developer/security/maintainer/operator)
- [ ] Guided setup wizard: workspace basics, first campaign, integration connection, notification preferences
- [ ] Sample data mode with realistic runs/crashes/artifacts and one-click reset
- [ ] Activation checklist widget (dashboard + settings) with progress persistence per user/workspace
- [ ] Contextual education system: feature tours, inline hints, empty-state guidance, docs links
- [ ] "What's next" recommendations based on usage state (no runs yet, no triage done, regressions detected)
- [ ] Team adoption dashboard: onboarding completion, feature activation, drop-off points
- [ ] Dismiss/snooze/resume controls and accessibility-compliant tour interactions

### Non-Functional
- [ ] Onboarding flows load < 1s and never block core app usage
- [ ] Sample data isolated from production data and clearly labeled
- [ ] All tours/checklists keyboard accessible and screen-reader friendly
- [ ] Telemetry events for funnel analysis (privacy-aware, opt-in/configurable)
- [ ] Works in SSR/CSR contexts without hydration issues

## Files to Modify / Create
```
apps/web/src/features/onboarding/
├── OnboardingProvider.tsx
├── journeys/
│   ├── RoleSelector.tsx
│   ├── DeveloperJourney.tsx
│   ├── SecurityJourney.tsx
│   └── MaintainerJourney.tsx
├── wizard/
│   ├── GuidedSetupWizard.tsx
│   ├── steps/
│   └── validation.ts
├── checklist/
│   ├── ActivationChecklist.tsx
│   ├── checklistModel.ts
│   └── progressStore.ts
├── education/
│   ├── ContextualHints.tsx
│   ├── FeatureTour.tsx
│   └── EmptyStateGuidance.tsx
├── demo/
│   ├── SampleDataSeeder.ts
│   ├── DemoModeBanner.tsx
│   └── reset.ts
└── analytics/
    └── onboardingEvents.ts

apps/web/src/app/onboarding/ (refactor/expand)
apps/web/src/app/onboarding-wizard/ (integrate)
apps/web/src/app/api/onboarding/
├── progress/route.ts
├── demo-data/route.ts
└── recommendations/route.ts
docs/onboarding/
├── user-journeys.md
└── demo-mode.md
```

## Acceptance Criteria
- New users can complete guided setup and reach first-value milestones without external docs
- Sample data mode enables exploration of all major features safely
- Activation checklist tracks progress accurately and persists across sessions
- Team adoption metrics visible to admins/maintainers
- Accessibility and performance budgets met for all onboarding surfaces

## PR Guide
- Branch: `issue/045-frontend-onboarding-adoption`
- Phase 1: Journey framework + checklist + persistence
- Phase 2: Guided wizard + sample data mode
- Phase 3: Contextual education + recommendations
- Phase 4: Team adoption dashboard + analytics + docs
- One logical PR per phase; include screenshots/video for UX changes
- Update `docs/contributors/` and user docs for new onboarding flows

**Estimated effort:** 4-5 weeks (200 pts)