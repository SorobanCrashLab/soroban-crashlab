---
name: "Frontend: Failure Clustering & Dedup Triage UI - Signature Intelligence, Cluster Management, and Root-Cause Workflows"
description: "Create an advanced UI for exploring failure clusters, deduplication quality, signature evolution, and cluster-level triage actions linked to runs, reproducers, and fixes"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Fuzzing produces many related failures; without strong clustering UX, triage is noisy and inefficient:
- Hard to understand why failures are grouped/split and to correct bad clusters
- No visibility into signature stability, cluster drift, or duplicate suppression impact
- Cluster-level actions (assign, prioritize, link issue, promote reproducer) are fragmented
- Difficult to compare representative traces/states across cluster members

## Proposed Solution
Implement a **Failure Clustering & Dedup Triage UI**:
- Cluster explorer with similarity graphs, exemplars, and membership timelines
- Explainability for clustering decisions and signature features
- Merge/split/relabel workflows with governance and audit trails
- Cluster-level triage, dedup metrics, and links to reproducers/regressions/issues

## Requirements
### Functional
- [ ] Cluster list and detail views: size, severity, churn, first/last seen, affected targets/envs
- [ ] Similarity visualization and exemplar comparison (trace/state/log snippets) (#068/#072/#075)
- [ ] Explainability panel: features/signals contributing to cluster assignment and confidence
- [ ] Curator actions: merge, split, reassign, suppress duplicate, mark known issue, set canonical reproducer (#079)
- [ ] Cluster-level triage integration (owners, SLA, status, linked issues/incidents) (#061/#062/#066)
- [ ] Metrics: dedup rate, false merge/split indicators, signature drift over time (#021/#084)
- [ ] Bulk operations and saved views for cluster queues (#051/#052)

### Non-Functional
- [ ] Scales to large failure volumes with server-side aggregation and virtualization
- [ ] Auditable, permission-aware curation actions with reversible history where possible
- [ ] Deterministic views for same filters/time windows
- [ ] Accessible visualizations with tabular alternatives

## Files to Modify / Create
```
apps/web/src/features/failures/clustering/
├── ClusterExplorer.tsx
├── ClusterDetail.tsx
├── SimilarityGraph.tsx
├── ClusterExplainability.tsx
├── CurationActions.tsx
└── hooks/useFailureClusters.ts

apps/web/src/app/failures/clusters/page.tsx
apps/web/src/app/api/failures/clusters/route.ts
apps/web/src/app/api/failures/clusters/[id]/route.ts
docs/frontend/failure-clustering-triage.md
```

## Acceptance Criteria
- Teams can understand, trust, and adjust clustering outcomes efficiently
- Cluster-level triage reduces duplicate work and accelerates remediation
- Explainability, metrics, and governance are visible and reliable
- Performance and accessibility requirements met

## PR Guide
- Branch: `issue/089-frontend-failure-clustering-dedup-triage`
- Phase 1: cluster explorer/detail + data models
- Phase 2: similarity/explainability + exemplar comparisons
- Phase 3: curation workflows + triage/integration links
- Phase 4: metrics, scale/perf, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
