---
name: "Frontend: Settings & Admin Console - Unified Configuration, Team Management, Integrations & Audit Visibility"
description: "Redesign settings into a scalable admin console covering user/team preferences, workspace configuration, integrations, notifications, API keys, and audit visibility with safe change workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Settings pages are fragmented (`apps/web/src/app/settings/`, integration-specific settings, notification preferences, network config) causing:
- Hard-to-discover configuration options
- Inconsistent validation, save states, and dangerous-action confirmations
- No unified admin view for workspace/team-level settings
- Limited audit visibility for who changed what and when

## Proposed Solution

Create a **Unified Settings & Admin Console**:
- Information architecture: Personal, Workspace, Integrations, Security, Notifications, Developer
- Consistent settings framework (schema-driven forms, dirty state, validation, confirmations)
- Team/workspace management views and permission-aware controls
- Change history/audit panel per settings section

## Requirements

### Functional
- [ ] New settings IA with sidebar navigation, search, and deep links
- [ ] Schema-driven settings forms with autosave/manual save modes and clear status
- [ ] Sections: profile, appearance, notifications, API keys/tokens, integrations, campaigns defaults, security/access, workspace/team
- [ ] Dangerous action flows (rotate key, disable integration, delete template) with confirmations
- [ ] Per-section change history (who/when/what) and rollback where feasible
- [ ] Import/export settings (safe fields only) with validation
- [ ] Permission-aware visibility and read-only states

### Non-Functional
- [ ] Consistent UX patterns across all settings pages
- [ ] Form reliability: no data loss on navigation/errors
- [ ] Accessible forms and navigation
- [ ] Performance: lazy-load sections, fast route transitions

## Files to Modify / Create
```
apps/web/src/features/settings/
├── SettingsShell.tsx
├── SettingsNav.tsx
├── sections/
│   ├── ProfileSettings.tsx
│   ├── AppearanceSettings.tsx
│   ├── NotificationSettings.tsx
│   ├── ApiKeysSettings.tsx
│   ├── IntegrationSettings.tsx
│   ├── SecuritySettings.tsx
│   └── WorkspaceSettings.tsx
├── framework/
│   ├── SettingsForm.tsx
│   ├── schema.ts
│   └── changeHistory.ts
└── hooks/useSettings.ts

apps/web/src/app/settings/** (restructure)
apps/web/src/app/api/settings/** (enhance)
```

## Acceptance Criteria
- All major settings discoverable and manageable from unified console
- Consistent validation/save/confirm UX across sections
- Change history visible for critical settings
- Permission-aware controls enforced in UI and API

## PR Guide
- Branch: `issue/042-frontend-settings-admin-console`
- Phase 1: IA + shell + settings framework
- Phase 2: Core sections migration
- Phase 3: Security/integrations/admin sections + audit history
- Phase 4: Import/export, polish, tests

**Estimated effort:** 4-5 weeks (200 pts)