---
name: "Frontend: Interactive Onboarding Sandbox & Guided Labs - Hands-On Fuzzing Tutorials, Progress Tracking, and Success Milestones"
description: "Deliver an interactive onboarding sandbox with guided labs that teach core CrashLab workflows (campaigns, triage, replay, analysis) using safe sample data and measurable progress"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
New contributors and users face a steep learning curve across Rust engine concepts, fuzz workflows, and advanced frontend analysis tools:
- Static docs are insufficient for learning end-to-end investigation workflows
- No safe sandbox with seeded runs/crashes/traces to practice without impacting real workspaces
- Onboarding progress, competency milestones, and role-based learning paths are not tracked
- Drop-off is high before users reach "first successful triage/repro" outcomes

## Proposed Solution
Build an **Interactive Onboarding Sandbox & Guided Labs** experience:
- Role-based learning paths (developer, triager, maintainer, operator) with step-by-step labs
- Sandbox workspace seeded with curated scenarios and simulated/live-safe exercises
- Embedded product tours, hints, validation checks, and completion milestones
- Progress analytics and recommendations for next labs/features to explore

## Requirements
### Functional
- [ ] Guided labs covering: first campaign, interpret results, triage crash, inspect trace/state, replay/regress, configure integrations (#045/#036/#068/#072/#079)
- [ ] Sandbox data provisioning/reset and isolation from real workspaces (#071)
- [ ] Interactive step validation (detect user actions/outcomes) with hints and recovery paths
- [ ] Progress tracking, badges/milestones, resume state, and role-based curricula
- [ ] Embedded contextual help, docs links, and optional video/diagram embeds (#060/#104)
- [ ] Admin/maintainer controls for lab content, feature flags, and cohort rollout (#029/#042)
- [ ] Telemetry (opt-in/privacy-safe) for completion/drop-off and lab quality improvement (#078)

### Non-Functional
- [ ] Fast lab startup and deterministic sandbox states
- [ ] Accessible instructional UI, keyboard navigation, captions/transcripts support (#038/#096)
- [ ] Localization-ready content structure (#040)
- [ ] No leakage of sandbox actions into production telemetry/audit contexts

## Files to Modify / Create
```
apps/web/src/features/onboarding-labs/
├── GuidedLabsHome.tsx
├── LabRunner.tsx
├── SandboxProvisioner.ts
├── ProgressTracker.ts
├── lab-content/
└── hooks/useGuidedLabs.ts

apps/web/src/app/onboarding/labs/page.tsx
apps/web/src/app/api/onboarding/labs/route.ts
docs/frontend/interactive-onboarding-sandbox.md
```

## Acceptance Criteria
- New users can complete hands-on labs and reach key workflow milestones in-app
- Sandbox is isolated, resettable, and reliable
- Progress and content management are functional, accessible, and privacy-aware

## PR Guide
- Branch: `issue/110-frontend-interactive-onboarding-sandbox`
- Phase 1: sandbox provisioning + lab engine + core curricula
- Phase 2: validation/progress + embedded guidance
- Phase 3: admin/content controls + analytics
- Phase 4: a11y/i18n hardening, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
