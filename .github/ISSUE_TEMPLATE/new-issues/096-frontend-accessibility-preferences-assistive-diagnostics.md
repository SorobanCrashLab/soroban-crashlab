---
name: "Frontend: Accessibility Preferences & Assistive Diagnostics Center - Personalization, Audits, and Inclusive UX Controls"
description: "Implement a user-facing accessibility preferences center and assistive diagnostics tools for motion/contrast/typography/input customization plus in-app a11y issue reporting and guidance"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Accessibility improvements must be configurable and continuously validated for diverse user needs:
- Users cannot easily tailor motion, contrast, font size, density, focus visibility, or input behaviors
- Complex visualizations and dense data views need assistive alternatives and explanations
- Accessibility regressions are caught late; no in-app diagnostics/reporting loop
- Preferences may not persist consistently across sessions/workspaces/devices

## Proposed Solution
Create an **Accessibility Preferences & Assistive Diagnostics Center**:
- Personalization controls for visual, motion, cognitive, and interaction accessibility
- Per-surface assistive modes (table/text alternatives for charts/graphs, simplified layouts)
- In-app diagnostics overlay for focus order, labels, contrast checks (dev/support mode)
- User feedback channel for accessibility barriers with contextual metadata

## Requirements
### Functional
- [ ] Preferences: reduced motion, high contrast themes, font scaling, line height, spacing/density, focus indicators, pointer/keyboard behaviors (#046/#038)
- [ ] Apply preferences globally and per-workspace with live preview and persistence (#071)
- [ ] Assistive toggles for complex views: data table alternatives, summary descriptions, pattern/shape encoding (#081/#082/#068)
- [ ] Accessibility diagnostics panel (role-gated/dev mode): focus traversal, missing labels, landmark/heading map, contrast sampling
- [ ] "Report accessibility issue" flow capturing route/component/screenshot context (privacy-safe) (#060/#063)
- [ ] Onboarding hints and shortcut integration for accessibility features (#045/#094)

### Non-Functional
- [ ] WCAG 2.2 AA+ alignment; preferences must not break layout or functionality
- [ ] Instant application without reload; SSR/CSR consistency
- [ ] No tracking of sensitive assistive preferences without consent; secure storage
- [ ] Comprehensive automated + manual accessibility test coverage

## Files to Modify / Create
```
apps/web/src/features/accessibility/
├── AccessibilityPreferencesCenter.tsx
├── preferenceControls/
├── AssistiveModesProvider.tsx
├── DiagnosticsPanel.tsx
└── hooks/useAccessibilityPrefs.ts

apps/web/src/app/settings/accessibility/page.tsx
apps/web/src/app/api/accessibility/preferences/route.ts
docs/frontend/accessibility-preferences-diagnostics.md
```

## Acceptance Criteria
- Users can personalize accessibility settings with immediate, persistent effects
- Key visualizations/workflows offer effective assistive alternatives
- Diagnostics and reporting improve detection/resolution of a11y issues
- Privacy, performance, and WCAG targets satisfied

## PR Guide
- Branch: `issue/096-frontend-accessibility-preferences-diagnostics`
- Phase 1: preference model/store + core controls
- Phase 2: assistive modes for complex views
- Phase 3: diagnostics/reporting flows
- Phase 4: hardening, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
