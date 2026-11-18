---
name: "DX: Comprehensive Error Boundary & Recovery System - Graceful Degradation, Error Reporting & User Recovery Flows"
description: "Build a production-grade error handling system with granular error boundaries, automatic recovery strategies, user-facing recovery actions, and integrated error reporting with context capture"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Error handling is inconsistent across the app:
- Global error boundary catches everything → blank page on partial failures
- No granular error boundaries per widget/panel/route segment
- No automatic recovery (retry, fallback, stale data)
- Users get cryptic errors with no recovery path
- Error context (user actions, state, network) not captured for debugging

## Proposed Solution

**Layered Error Recovery System**:

- **Granular Boundaries**: Per-widget, per-panel, per-route error boundaries with isolation
- **Recovery Strategies**: Auto-retry with backoff, stale-while-revalidate fallback, degraded mode
- **User Recovery UI**: Actionable error cards with retry, reset, report, navigate-back options
- **Context Capture**: Breadcrumbs, component state, network requests, user actions → error report
- **Error Classification**: Network, auth, permission, validation, server, client — with specific UX per type
- **Monitoring Integration**: Sentry (#existing) + structured logging with deduplication

## Requirements

### Functional
- [ ] Error boundary hierarchy: app → route → panel → widget with isolation
- [ ] Recovery strategies: retry (exponential backoff), fallback component, stale data display, offline mode
- [ ] Typed error classification with specific UI treatments per error type
- [ ] User recovery actions: retry, refresh data, reset component, go back, report issue
- [ ] Error context capture: breadcrumbs, last 10 actions, component props/state snapshot, network log
- [ ] Error deduplication and grouping for reporting
- [ ] Development error overlay with stack trace, component tree, and fix suggestions

### Non-Functional
- [ ] Error boundary render < 16ms
- [ ] No cascading failures (one widget crash doesn't affect siblings)
- [ ] Context capture < 5ms overhead
- [ ] Works in SSR and client components

## Files to Modify / Create
```
apps/web/src/components/error/
├── ErrorBoundary.tsx (enhance)
├── GranularBoundary.tsx
├── WidgetErrorBoundary.tsx (enhance)
├── ErrorFallback.tsx
├── ErrorCard.tsx
├── RecoveryActions.tsx
├── ErrorClassification.ts
└── strategies/
    ├── RetryStrategy.ts
    ├── FallbackStrategy.ts
    ├── StaleDataStrategy.ts
    └── OfflineStrategy.ts

apps/web/src/lib/errors/
├── ErrorContext.ts
├── BreadcrumbCollector.ts
├── ErrorReporter.ts
├── ErrorDeduplicator.ts
└── DevOverlay.tsx

apps/web/src/app/**/error.tsx (all route segments)
apps/web/src/app/**/global-error.tsx (enhance)
```

## Acceptance Criteria
- Widget failure isolated with recovery UI (no full-page crash)
- Auto-retry recovers from transient network errors
- Error reports include actionable context
- All route segments have error boundaries

## PR Guide
- Branch: `issue/030-dx-error-recovery-system`
- Phase 1: Granular boundaries + classification
- Phase 2: Recovery strategies + user actions
- Phase 3: Context capture + reporting
- Phase 4: Route-level boundaries + dev overlay

**Estimated effort:** 3-4 weeks