---
name: "Frontend: Notification Center & Inbox - Unified Alerts, Mentions, Activity Feed & Preference Controls"
description: "Create a unified in-app notification center/inbox aggregating alerts, triage mentions, integration events, and system activity with read states, preferences, and real-time delivery"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Notifications are scattered (`notification-center/`, `notification-preferences*`, integrations alerts) with limited UX:
- No unified inbox for in-app notifications across domains
- Inconsistent read/unread state and grouping
- Weak preference controls (channels, categories, digest frequency)
- No deep links/actions from notifications to resolve issues quickly
- Real-time delivery/update behavior inconsistent

## Proposed Solution

Build a **Unified Notification Center**:
- Central inbox with categories (alerts, triage, campaigns, integrations, system)
- Read/unread, archive, snooze, bulk actions, and deep-link actions
- Preference center (per-category, per-channel, quiet hours, digests)
- Real-time updates via SSE (#002) and cross-tab sync

## Requirements

### Functional
- [ ] Notification inbox UI (bell + panel + full page) with filters and grouping
- [ ] Categories: crashes/regressions, campaign status, mentions/assignments, integration failures, system announcements
- [ ] States/actions: unread/read, archive, snooze, mute source, mark all read
- [ ] Deep-link actions: open run, acknowledge alert, retry webhook, view incident
- [ ] Preference center: channel/category toggles, severity thresholds, quiet hours, digest schedule
- [ ] Real-time delivery and badge count updates; cross-tab synchronization
- [ ] Pagination/virtualization for large notification history

### Non-Functional
- [ ] Notification render/update without layout jank
- [ ] Delivery-to-UI latency < 1s for real-time events
- [ ] Accessible keyboard navigation and screen reader announcements
- [ ] Preference changes persisted and auditable

## Files to Modify / Create
```
apps/web/src/features/notifications/
├── NotificationCenter.tsx
├── NotificationInboxPage.tsx
├── NotificationItem.tsx
├── NotificationFilters.tsx
├── PreferencesCenter.tsx
├── store/
│   ├── notificationStore.ts
│   └── sync.ts
└── hooks/
    ├── useNotifications.ts
    └── useNotificationPreferences.ts

apps/web/src/app/notification-center/ (refactor/enhance)
apps/web/src/app/api/notifications/ (enhance CRUD/preferences/stream)
apps/web/src/app/notification-preferences.tsx (migrate)
```

## Acceptance Criteria
- Unified inbox shows categorized notifications with actions and read states
- Preferences control delivery behavior across channels/categories
- Real-time badge/count and list updates work reliably
- A11y and performance targets met

## PR Guide
- Branch: `issue/041-frontend-notification-center`
- Phase 1: Data model/store + inbox UI
- Phase 2: Preferences + actions + deep links
- Phase 3: Real-time/SSE + cross-tab sync
- Phase 4: A11y, virtualization, tests

**Estimated effort:** 4-5 weeks (200 pts)