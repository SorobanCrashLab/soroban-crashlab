---
name: "Frontend: Accessibility Program - WCAG 2.2 AA Compliance, Keyboard Navigation, Screen Reader UX & Automated Audits"
description: "Execute a comprehensive accessibility overhaul across the web app to achieve WCAG 2.2 AA with robust keyboard navigation, screen reader support, focus management, and CI-enforced audits"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Despite some a11y utilities/tests (`a11y.spec.ts`, `AccessibilityProvider.tsx`, `components/a11y/`), the app likely has systemic gaps:
- Inconsistent focus management in dialogs/drawers/overlays/command palette
- Complex widgets (tables, graphs, timelines, filters) not fully accessible
- Color contrast and motion preferences not uniformly respected
- Insufficient screen reader labels/announcements for dynamic updates (SSE/live data)
- Accessibility regressions not consistently blocked in CI

## Proposed Solution

Run a **WCAG 2.2 AA Compliance Program**:
- Audit all key flows and components; remediate issues systematically
- Build accessible primitives/patterns for complex widgets
- Implement focus traps, roving tabindex, live regions, and skip links consistently
- Enforce automated axe/Playwright a11y checks and manual checklist in CI/PR process

## Requirements

### Functional
- [ ] Accessible navigation: skip links, landmarks, consistent heading structure
- [ ] Keyboard support for all interactive elements (tables, menus, dialogs, charts controls, timeline scrubber)
- [ ] Focus management: traps for modals, restore focus on close, visible focus indicators
- [ ] Screen reader support: labels, descriptions, status/live region announcements for real-time updates
- [ ] Forms: error association, instructions, validation messaging, autocomplete where appropriate
- [ ] Color/contrast compliance and non-color status indicators
- [ ] Respect `prefers-reduced-motion` and `prefers-contrast` where applicable

### Non-Functional
- [ ] WCAG 2.2 AA compliance target for core flows
- [ ] axe-core: 0 critical/serious violations on key pages in CI
- [ ] A11y regression tests added for complex widgets
- [ ] Document accessibility patterns in contributor docs

## Files to Modify / Create
```
apps/web/src/components/a11y/ (enhance primitives)
apps/web/src/components/ui/* (audit/fix)
apps/web/src/features/* (complex widget accessibility)
apps/web/src/app/**/ (landmarks/headings/skip links)
apps/web/e2e/a11y/*.spec.ts (expand coverage)
apps/web/e2e/a11y.spec.ts (expand)
docs/accessibility/
├── wcag22-audit.md
├── patterns.md
└── testing-checklist.md
.github/workflows/a11y.yml (or integrate)
```

## Acceptance Criteria
- Core flows (dashboard, runs, run detail, triage, campaigns, settings, integrations) pass WCAG 2.2 AA checks
- Keyboard-only and screen-reader workflows documented and verified
- CI blocks critical/serious accessibility regressions
- Contributor guidance published for accessible UI development

## PR Guide
- Branch: `issue/038-frontend-accessibility-wcag22`
- Phase 1: Audit + baseline + shared primitives
- Phase 2: Core flow remediation (runs/campaigns/triage)
- Phase 3: Complex widgets (charts/timeline/graph/table)
- Phase 4: CI enforcement + docs

**Estimated effort:** 5-6 weeks (200 pts)