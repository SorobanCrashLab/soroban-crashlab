---
name: "Frontend: Mobile-First Responsive & PWA - Adaptive Layouts, Touch UX, Offline Support & Installability"
description: "Transform the web app into a mobile-first, responsive PWA with touch-optimized interactions, offline/read-only resilience, installability, and performance tuning for constrained devices"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Current UI is primarily desktop-oriented. Mobile usage (on-call, quick triage, monitoring) is hindered by:
- Dense tables/charts/workspaces not optimized for small screens
- Limited touch interactions and gesture support
- No offline resilience for recently viewed runs/campaigns
- No PWA install experience or background update handling
- Performance issues on mid/low-end mobile devices

## Proposed Solution

Implement **Mobile-First Responsive + PWA** capabilities:
- Responsive layout system and adaptive component variants for key flows
- Touch-friendly interactions (swipe actions, bottom sheets, collapsible panels)
- Service worker caching strategy for shell + recent data + offline fallback views
- PWA manifest/install prompts/update notifications
- Mobile performance budgets and profiling

## Requirements

### Functional
- [ ] Responsive redesign for dashboard, runs list/detail, campaigns, alerts, settings
- [ ] Mobile navigation patterns (bottom nav/drawer), sticky actions, safe-area support
- [ ] Touch interactions: swipe-to-reveal actions, pull-to-refresh where appropriate
- [ ] PWA: manifest, icons, install prompt UX, update available flow
- [ ] Offline mode: cached shell, recently viewed runs/campaign summaries, offline banner
- [ ] Background sync or queued actions for safe mutations (where feasible)
- [ ] Mobile-specific data density controls (compact/comfortable)

### Non-Functional
- [ ] Lighthouse mobile performance/accessibility targets defined and tracked
- [ ] Smooth scrolling/interactions on mid-tier devices
- [ ] Service worker cache correctness (no stale critical data bugs)
- [ ] Works on iOS Safari and Android Chrome latest 2 versions

## Files to Modify / Create
```
apps/web/src/app/layout.tsx (viewport/meta/PWA hooks)
apps/web/src/components/navigation/ (mobile nav)
apps/web/src/features/** (responsive variants)
apps/web/public/manifest.json
apps/web/public/icons/*
apps/web/src/service-worker/ or app PWA integration
apps/web/src/lib/offline/
├── cacheStrategy.ts
├── offlineQueue.ts
└── useOfflineState.ts
apps/web/e2e/mobile-responsive.spec.ts (expand)
docs/mobile-pwa.md
```

## Acceptance Criteria
- Core flows usable on 360px-width devices without horizontal scroll
- App installable as PWA with update handling
- Offline mode provides useful read-only access to recent data
- Mobile e2e coverage for key workflows

## PR Guide
- Branch: `issue/039-frontend-mobile-pwa`
- Phase 1: Responsive layout/navigation foundations
- Phase 2: Key flow mobile adaptations (runs/campaigns/triage)
- Phase 3: PWA/offline/service worker
- Phase 4: Performance tuning + tests/docs

**Estimated effort:** 5-6 weeks (200 pts)