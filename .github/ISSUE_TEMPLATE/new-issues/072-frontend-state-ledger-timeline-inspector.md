---
name: "Frontend: State & Ledger Timeline Inspector - Storage Diffs, Contract State Evolution, and Causal Event Correlation"
description: "Create a specialized inspector for contract/storage/ledger state evolution over time with snapshot diffs, key-level tracking, and correlation to trace events, crashes, and transactions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

Many Soroban failures are state-dependent, but users lack a first-class way to inspect how contract and ledger state evolves during execution.

Current limitations:
- State changes are buried in traces/logs/artifacts without a coherent timeline
- No key-level tracking across snapshots (reads/writes, TTL/expiry, auth-related state)
- Hard to correlate state mutations with specific host calls, transactions, or failure points
- Diffing large state objects is slow and unreadable in generic JSON views
- No ability to compare state evolution across runs/replays for regression analysis

## Proposed Solution

Implement a **State & Ledger Timeline Inspector**:
- Timeline of state snapshots and mutation events with semantic grouping (storage, ledger, auth, balances/resources)
- Key-level diff viewer (tree + structured table) with change classification (added/removed/modified)
- Watchlists for critical keys/contracts and jump-to-mutation navigation
- Correlation with trace graph, logs, and run diff/time-travel views
- Exportable state evolution reports for triage and reproducibility evidence

## Requirements

### Functional
- [ ] Ingest/normalize state snapshots and mutation events from run artifacts/traces
- [ ] Timeline view showing snapshots, transactions/invocations, and mutation density
- [ ] Key-level diffing across selected points (A/B) and sequential playback mode
- [ ] Filters/search by contract/address, key namespace, mutation type, actor/call origin
- [ ] Watchlist pins and alerts for unexpected changes to critical keys
- [ ] Correlated navigation to trace nodes, log entries, and divergence points (#067/#068)
- [ ] Compare state evolution across runs/replays (baseline vs candidate)
- [ ] Redacted/safe rendering for sensitive values with permission-aware reveal (#022/#070)

### Non-Functional
- [ ] Efficient diffing for large state trees (structural sharing, incremental compute, workers)
- [ ] Virtualized rendering for thousands of keys/events
- [ ] Deterministic diff results and canonical key ordering
- [ ] Accessible table/tree interactions and keyboard navigation
- [ ] Robust handling of missing/partial snapshots with explicit data-quality indicators

## Files to Modify / Create
```
apps/web/src/features/state-inspector/
├── StateTimelineInspector.tsx
├── timeline/StateTimeline.tsx
├── diff/StateDiffViewer.tsx
├── watchlist/KeyWatchlist.tsx
├── correlation/StateEventLinks.tsx
└── hooks/useStateInspector.ts

apps/web/src/app/runs/[id]/state/page.tsx
apps/web/src/app/api/runs/[id]/state/route.ts
apps/web/src/lib/state/
├── normalizeSnapshots.ts
├── diffEngine.ts
└── keyIndex.ts
docs/frontend/state-ledger-timeline-inspector.md
```

## Acceptance Criteria
- Users can trace how and when specific state keys changed relative to execution events
- State diffs are readable, performant, and link to causal trace/log evidence
- Cross-run state evolution comparison supports regression investigation
- Sensitive data and permissions handled correctly; missing data clearly indicated

## PR Guide
- Branch: `issue/072-frontend-state-ledger-timeline-inspector`
- Phase 1: snapshot normalization + timeline + basic key diff
- Phase 2: watchlists, filters, correlation with trace/logs
- Phase 3: cross-run comparison and playback integration
- Phase 4: performance, redaction/permissions, tests/docs
- Coordinate with #036/#044/#067/#068/#070

**Estimated effort:** 6-8 weeks (200 pts)
