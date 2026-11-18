---
name: "Frontend: Unified State & Data Fetching Architecture - Query Caching, Normalization, Optimistic Updates & Offline Resilience"
description: "Establish a cohesive client-side state and data-fetching architecture using TanStack Query patterns, normalized entities, optimistic mutations, and resilient cache strategies across the web app"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Data fetching and client state management are inconsistent across `apps/web` (ad-hoc `fetch`, custom hooks, duplicated request logic, partial caching in utilities). This causes stale UI, redundant network calls, race conditions, and poor UX during mutations and real-time updates.

Observed gaps:
- No standardized query/mutation layer for runs, campaigns, crashes, integrations, settings
- Cache invalidation is manual/error-prone; cross-page consistency is weak
- Optimistic updates and rollback behavior inconsistent
- Loading/error/retry patterns duplicated per component
- Difficult integration with SSE/real-time streams (#002) and offline/PWA goals (#039)

## Proposed Solution

Implement a **Unified Data Layer**:
- Central query client configuration (TanStack Query or equivalent) with typed query/mutation keys
- Normalized entity cache helpers for runs/campaigns/crashes/artifacts/integrations
- Standard mutation patterns: optimistic updates, rollback, invalidation, and toast/notification hooks
- Request deduplication, background refetch, pagination/infinite query primitives
- Integration adapters for SSE/WebSocket live updates and mock/dev modes

## Requirements

### Functional
- [ ] Shared `QueryClientProvider` setup with SSR-safe hydration boundaries for Next.js App Router
- [ ] Typed query key factory and API hooks for core domains (runs, campaigns, crashes, artifacts, integrations, settings, notifications)
- [ ] Standardized mutation helpers: optimistic update, scoped invalidation, conflict handling, retry policies
- [ ] Pagination and infinite-scroll query utilities compatible with virtualized tables (#001)
- [ ] Cache synchronization with real-time events (SSE #002): patch/update entities without full refetch where safe
- [ ] Global error/loading/retry conventions and devtools integration (development only)
- [ ] Migration plan and codemods/guidelines to replace ad-hoc fetch patterns in priority surfaces

### Non-Functional
- [ ] Reduce duplicate network requests on dashboard/run detail by measurable margin (target >40%)
- [ ] Mutation-perceived latency improved via optimistic UI on key actions
- [ ] No stale-data regressions in concurrent tab/update scenarios
- [ ] Memory-safe cache limits and garbage collection policies

## Files to Modify / Create
```
apps/web/src/lib/data/
├── queryClient.ts
├── queryKeys.ts
├── apiHooks/
│   ├── runs.ts
│   ├── campaigns.ts
│   ├── crashes.ts
│   ├── integrations.ts
│   └── settings.ts
├── mutations/
│   ├── optimistic.ts
│   ├── invalidation.ts
│   └── conflicts.ts
├── realtimeSync.ts
└── devtools.ts

apps/web/src/app/providers.tsx (integrate)
apps/web/src/lib/api-client.ts (adapter/refactor)
docs/architecture/frontend-data-layer.md
```

## Acceptance Criteria
- Core domains use shared query/mutation hooks with consistent caching behavior
- Optimistic updates implemented for key triage/campaign actions with rollback on failure
- Real-time updates reconcile with query cache correctly
- Measurable reduction in redundant requests and improved perceived responsiveness

## PR Guide
- Branch: `issue/055-frontend-data-fetching-architecture`
- Phase 1: Query client + key factories + core read hooks
- Phase 2: Mutation patterns + optimistic updates + invalidation
- Phase 3: Real-time cache sync + pagination/infinite queries
- Phase 4: Migration of high-traffic pages + docs/tests
- Must not break mock fallback mode or existing API contracts

**Estimated effort:** 5-6 weeks (200 pts)