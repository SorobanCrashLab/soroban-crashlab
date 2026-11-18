---
name: "Frontend: Integration Marketplace & Setup UX - Catalog, Guided Configuration, Health Status & Troubleshooting"
description: "Create a unified integration marketplace and setup experience with discoverable catalog, guided configuration wizards, connection health, troubleshooting, and lifecycle management"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Integrations (GitHub Actions, Slack, PagerDuty, webhooks, Sentry, Prometheus, etc.) are surfaced in separate pages with inconsistent setup flows and limited operational visibility.

Issues:
- No centralized catalog/discovery of available integrations and capabilities
- Setup/configuration UX inconsistent and error-prone
- Hard to understand connection health, permissions, and recent delivery status
- Troubleshooting requires digging through logs/docs
- No lifecycle management view (enabled, misconfigured, degraded, paused)

## Proposed Solution

Build an **Integration Marketplace & Setup Hub**:
- Catalog of integrations with capabilities, prerequisites, and setup effort
- Guided configuration wizards with validation and test-connection steps
- Integration detail pages with health, event activity, errors, and remediation actions
- Unified enable/disable/pause/re-auth flows and audit visibility
- Deep links from alerts/failures to troubleshooting steps

## Requirements

### Functional
- [ ] Integration catalog with search/filter (category: CI, alerts, observability, issue tracking, webhooks)
- [ ] Per-integration cards: status, capabilities, required permissions/secrets, docs links
- [ ] Guided setup wizards with step validation, test connection, and dry-run event send
- [ ] Integration detail pages: configuration summary, health checks, recent events/deliveries, error logs
- [ ] Lifecycle actions: connect/disconnect, pause/resume, re-authenticate, rotate credentials (#025)
- [ ] Troubleshooting playbooks with contextual diagnostics and suggested fixes
- [ ] RBAC-aware controls and audit trail for configuration changes
- [ ] Integration recommendations based on workspace usage (e.g., suggest Slack when alerts enabled)

### Non-Functional
- [ ] Setup flows resilient to partial failures with resumable state
- [ ] Health status refreshed in near real-time (SSE/polling fallback)
- [ ] Consistent UX patterns across all integration types
- [ ] Accessible forms, status indicators, and error messaging

## Files to Modify / Create
```
apps/web/src/features/integrations/
├── marketplace/
│   ├── IntegrationCatalog.tsx
│   ├── IntegrationCard.tsx
│   └── filters.ts
├── setup/
│   ├── SetupWizard.tsx
│   ├── steps/
│   └── validators.ts
├── detail/
│   ├── IntegrationDetail.tsx
│   ├── HealthPanel.tsx
│   ├── ActivityPanel.tsx
│   └── TroubleshootingPanel.tsx
├── lifecycle/
│   ├── actions.ts
│   └── audit.ts
└── hooks/useIntegrationsHub.ts

apps/web/src/app/integrations/ (refactor to hub + detail routes)
apps/web/src/app/api/integrations/ (enhance catalog/health/test endpoints)
docs/integrations/
├── marketplace.md
└── troubleshooting-guides.md
```

## Acceptance Criteria
- Users can discover, configure, test, and manage integrations from one hub
- Health and recent activity visible per integration with actionable troubleshooting
- Configuration changes audited and permission-aware
- Setup success rate improved with guided validation and test steps

## PR Guide
- Branch: `issue/048-frontend-integration-marketplace`
- Phase 1: Catalog + shared integration model + hub shell
- Phase 2: Setup wizards + test connection flows
- Phase 3: Health/activity/troubleshooting detail views
- Phase 4: Lifecycle actions, recommendations, docs/tests
- Coordinate with #011-#015 integration backend issues

**Estimated effort:** 5-6 weeks (200 pts)