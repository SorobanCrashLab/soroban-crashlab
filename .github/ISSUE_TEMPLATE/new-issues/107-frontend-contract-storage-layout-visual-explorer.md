---
name: "Frontend: Contract Storage Layout & Keyspace Visual Explorer - Typed Slot Mapping, History, and Access Pattern Analysis"
description: "Deliver a visual explorer for Soroban contract storage layout and keyspace behavior, mapping typed keys/entries, access patterns, mutations, and historical evolution across runs"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Understanding contract storage behavior is essential for debugging state-dependent bugs, but raw key/value views are opaque:
- No visual mapping from storage keys/entries to typed structures and semantic meaning
- Hard to analyze read/write patterns, hot keys, TTL/expiration effects, and mutation frequency
- Comparing storage layout behavior across runs/campaigns is manual and error-prone
- Investigators lack linkage between storage accesses and trace/log/state-timeline evidence

## Proposed Solution
Build a **Contract Storage Layout & Keyspace Visual Explorer**:
- Typed decoding and layout visualization of contract storage (instance/persistent/temporary/keyed entries)
- Keyspace maps (tree/heatmap/graph) showing access frequency, size, churn, and ownership
- Temporal views of reads/writes and value evolution with diff integration (#072)
- Cross-linking to trace spans, calls, and reproducer/campaign contexts

## Requirements
### Functional
- [ ] Ingest storage snapshots/access events and decode keys/values with schema-aware typing (#073)
- [ ] Layout views: hierarchical keyspace tree, table, and heatmap by access/mutation/size
- [ ] Access pattern analytics: hot keys, read-before-write, unexpected writes, TTL/expiry anomalies
- [ ] Historical playback and diff across snapshots/runs with filters by contract/address/namespace (#072/#067)
- [ ] Link storage events to trace nodes, call sites, and log entries (#068/#075)
- [ ] Export selected keyspace views/reports and save/share investigations (#043/#052/#056)
- [ ] Permission-aware redaction for sensitive stored values (#070/#022)

### Non-Functional
- [ ] Efficient indexing/virtualization for 100k+ keys and long histories
- [ ] Deterministic decoding/diff outputs given same schemas/inputs
- [ ] Accessible visual alternatives (tables/summaries) and keyboard navigation
- [ ] Safe handling of unknown/partial schemas with explicit confidence indicators

## Files to Modify / Create
```
apps/web/src/features/storage-explorer/
├── StorageLayoutExplorer.tsx
├── KeyspaceTree.tsx
├── AccessHeatmap.tsx
├── MutationTimeline.tsx
├── panels/
└── hooks/useStorageExplorer.ts

apps/web/src/app/contracts/[id]/storage/page.tsx
apps/web/src/app/api/contracts/storage/route.ts
docs/frontend/contract-storage-layout-explorer.md
```

## Acceptance Criteria
- Users can understand and navigate contract storage structure and behavior visually
- Access/mutation patterns and anomalies are discoverable and linked to execution evidence
- Cross-run comparisons and exports work with correct redaction/permissions

## PR Guide
- Branch: `issue/107-frontend-contract-storage-layout-explorer`
- Phase 1: decoding/indexing + base layout/tree views
- Phase 2: heatmaps/analytics + temporal/diff integration
- Phase 3: evidence linking + export/share
- Phase 4: perf/a11y/redaction tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
