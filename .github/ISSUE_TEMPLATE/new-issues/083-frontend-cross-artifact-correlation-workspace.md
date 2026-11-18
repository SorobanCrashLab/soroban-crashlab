---
name: "Frontend: Cross-Artifact Correlation Workspace - Unified Linking of Runs, Logs, Traces, State, and Evidence"
description: "Create a correlation workspace that automatically and manually links related artifacts across runs, traces, logs, state snapshots, reproducers, and incidents to accelerate root-cause analysis"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Investigations span many artifact types, but relationships are implicit and fragmented:
- Hard to pivot from a crash to the exact trace span, log lines, state mutation, and reproducer
- Related runs (same signature/env/commit) are not surfaced cohesively
- Evidence collected during triage/incidents is disconnected from source artifacts
- Manual correlation is slow and error-prone, especially under time pressure
- No confidence scoring or explanation for suggested correlations

## Proposed Solution
Build a **Cross-Artifact Correlation Workspace**:
- Correlation graph/timeline linking runs, traces, logs, state diffs, artifacts, reproducers, issues, and incidents
- Heuristic + metadata-based correlation suggestions with confidence and rationale
- Manual link/unlink/confirm workflows feeding improved suggestions
- Unified pivot UI: select any node to open synchronized context panes
- Persisted correlation sets for triage, postmortems, and shareable evidence bundles

## Requirements
### Functional
- [ ] Correlation entity model and graph view for heterogeneous artifacts and events
- [ ] Automatic suggestions using IDs, timestamps, signatures, commit/env fingerprints, and content hashes
- [ ] Confidence scoring, rationale display, and user confirm/reject feedback loop
- [ ] Manual linking, tagging, and grouping into investigation sets/evidence bundles (#069)
- [ ] Synchronized pivoting across inspector panes (trace, logs, state, artifacts, run detail) (#036/#068/#072/#075)
- [ ] Search/filter by entity type, confidence, time window, workspace, and correlation source
- [ ] Share/export correlation maps and include in incidents/postmortems/reports (#043/#066)
- [ ] Permission-aware visibility and redaction across linked artifacts (#022/#070)

### Non-Functional
- [ ] Scalable graph rendering and querying for large investigations (progressive loading)
- [ ] Deterministic suggestion ordering for identical inputs
- [ ] Auditable link changes and feedback events (#063)
- [ ] Accessible graph/list alternatives and keyboard navigation

## Files to Modify / Create
```
apps/web/src/features/correlation/
├── CorrelationWorkspace.tsx
├── CorrelationGraph.tsx
├── SuggestionPanel.tsx
├── InvestigationSets.tsx
└── hooks/useCorrelation.ts

apps/web/src/app/investigations/page.tsx
apps/web/src/app/api/correlation/suggest/route.ts
apps/web/src/app/api/correlation/links/route.ts
apps/web/src/lib/correlation/
├── engine.ts
├── scoring.ts
└── model.ts
docs/frontend/cross-artifact-correlation.md
```

## Acceptance Criteria
- Investigators can traverse related evidence across artifact types from a single workspace
- Suggested correlations are explainable, actionable, and improvable via feedback
- Correlation sets persist, share, and integrate with triage/incident workflows
- Performance, permissions, and auditability requirements satisfied

## PR Guide
- Branch: `issue/083-frontend-cross-artifact-correlation-workspace`
- Phase 1: model + graph/list UI + basic metadata linking
- Phase 2: suggestion engine/scoring + confirm/reject feedback
- Phase 3: synchronized pivots + investigation sets + export/share
- Phase 4: scaling, permissions/audit, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
