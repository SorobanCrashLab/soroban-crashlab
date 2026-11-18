---
name: "Frontend: Advanced Form System - Schema-Driven Forms, Validation, Autosave, and Complex Workflows"
description: "Implement a schema-driven form platform for complex configuration workflows (campaigns, integrations, settings) with strong validation, autosave drafts, wizards, and accessibility"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Forms across the app (campaign config, integration setup, settings, alert rules) are implemented inconsistently with duplicated validation and fragile state handling.

Issues:
- Inconsistent client/server validation and error messaging
- No unified autosave/draft recovery for long forms
- Complex multi-step workflows lack progress persistence and resumability
- Poor handling of dependent fields, arrays, and conditional sections
- Accessibility and keyboard UX inconsistent

## Proposed Solution

Build a **Schema-Driven Form System**:
- Zod schemas as single source of truth for client/server validation contracts
- Reusable form primitives (React Hook Form or equivalent) with typed field bindings
- Autosave drafts, dirty-state tracking, conflict detection, and recovery prompts
- Wizard/stepper framework for multi-step flows with per-step validation
- Standardized error summary, inline errors, and accessible field patterns

## Requirements

### Functional
- [ ] Shared form framework with typed schema integration and reusable field components
- [ ] Support primitives/complex fields: text, select, multiselect, toggles, arrays, nested objects, key-value editors
- [ ] Conditional logic and cross-field validation (dependencies, mutually exclusive options)
- [ ] Autosave drafts (local/server) with restore, discard, and last-saved indicators
- [ ] Multi-step wizard support with step validation, progress persistence, and resumable sessions
- [ ] Server error mapping to fields and global form errors; optimistic submit handling
- [ ] Unsaved-changes navigation guards and conflict resolution on concurrent edits
- [ ] Accessible labels/help text/error associations and keyboard navigation

### Non-Functional
- [ ] Smooth performance for large forms (100+ fields) with minimal re-renders
- [ ] Deterministic validation behavior matching server-side rules where applicable
- [ ] Reusable across campaigns/integrations/settings/automation surfaces
- [ ] Comprehensive unit/integration/e2e coverage for critical flows

## Files to Modify / Create
```
apps/web/src/components/forms/
├── FormProvider.tsx
├── fields/
│   ├── TextField.tsx
│   ├── SelectField.tsx
│   ├── ArrayField.tsx
│   ├── KeyValueField.tsx
│   └── ToggleField.tsx
├── validation/
│   ├── zodResolver.ts
│   └── serverErrors.ts
├── wizard/
│   ├── Wizard.tsx
│   └── Stepper.tsx
├── autosave/
│   ├── DraftStore.ts
│   └── useAutosave.ts
└── hooks/useAppForm.ts

apps/web/src/features/campaigns/ (adopt)
apps/web/src/features/integrations/setup/ (adopt)
apps/web/src/features/settings/ (adopt)
docs/frontend/forms.md
```

## Acceptance Criteria
- Major complex forms migrated to shared schema-driven system
- Autosave/draft recovery and wizard persistence work reliably
- Validation and error UX consistent and accessible
- Reduced form-related bugs and duplicated logic

## PR Guide
- Branch: `issue/057-frontend-advanced-form-system`
- Phase 1: Core framework + primitives + validation
- Phase 2: Autosave/drafts + wizard framework
- Phase 3: Migrate campaign/integration/settings forms
- Phase 4: A11y, tests, docs

**Estimated effort:** 5-6 weeks (200 pts)