---
name: "Frontend: Unified Notification Inbox & Action Center - Cross-Channel Triage, Snooze, Batching, and State Sync"
description: "Create a unified in-app notification inbox and action center that aggregates alerts across systems, supports triage workflows, batching/snooze, and synchronized read/action state"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Users receive notifications from CI, regressions, incidents, mentions, and policies across multiple surfaces/channels with inconsistent state:
- No single inbox to review, prioritize, and act on notifications in-app
- Duplicate/noisy alerts lack batching, dedup context, or smart grouping
- Read/ack/snooze states do not sync well across sessions/devices/channels
- Actionable notifications don't deep-link into the right remediation workflow

## Proposed Solution
Implement a **Unified Notification Inbox & Action Center**:
- Aggregated inbox with filters, grouping, priority, and bulk actions
- Triage controls: mark read/unread, acknowledge, snooze, mute rules, assign/follow (#041/#095)
- Deep-linked actions to incidents, CI gates, triage items, reviews, and runbooks (#066/#093/#061/#080)
- Cross-session state sync and notification preference integration

## Requirements
### Functional
- [ ] Inbox UI with tabs/views (all, mentions, assigned, CI, incidents, regressions, system)
- [ ] Grouping/batching by source/entity/severity/time; dedup indicators and noise controls
- [ ] Actions: read/unread, ack, snooze, mute similar, pin, bulk operations (#051)
- [ ] Deep links and inline previews/context cards for referenced entities
- [ ] Sync read/action state across devices/sessions and reflect channel acknowledgments where supported (#002)
- [ ] Integration with notification rules/escalations and preferences (#095/#041)
- [ ] Saved filters/views and search within notifications (#052/#035)
- [ ] Audit/privacy-safe handling for sensitive notification content (#063/#070)

### Non-Functional
- [ ] Real-time updates with efficient pagination/virtualization for high volumes
- [ ] Low-latency interactions and optimistic UI with reconciliation
- [ ] Accessible keyboard navigation, announcements, and focus management
- [ ] Deterministic grouping/sorting behavior

## Files to Modify / Create
```
apps/web/src/features/notification-inbox/
├── NotificationInbox.tsx
├── NotificationList.tsx
├── NotificationFilters.tsx
├── BulkActionBar.tsx
├── NotificationPreview.tsx
└── hooks/useNotificationInbox.ts

apps/web/src/app/inbox/page.tsx
apps/web/src/app/api/notifications/inbox/route.ts
docs/frontend/unified-notification-inbox.md
```

## Acceptance Criteria
- Users can triage and act on notifications efficiently from one inbox
- State sync, grouping, and deep-link actions are reliable and low-noise
- Integrates with rules/preferences and respects permissions/privacy

## PR Guide
- Branch: `issue/118-frontend-unified-notification-inbox`
- Phase 1: inbox model/UI + aggregation/grouping
- Phase 2: actions/snooze/bulk + deep links
- Phase 3: realtime sync + rules/preferences integration
- Phase 4: a11y/perf/privacy tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
