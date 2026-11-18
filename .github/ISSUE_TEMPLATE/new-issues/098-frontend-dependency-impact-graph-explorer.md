---
name: "Frontend: Dependency & Impact Graph Explorer - Contract, Service, and Change Blast-Radius Visualization"
description: "Create an interactive dependency and impact graph for contracts, artifacts, services, and configs to visualize relationships, trace blast radius of failures/changes, and prioritize remediation"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Soroban projects and platform operations involve complex dependencies (contracts, addresses, artifacts, runners, integrations, configs). Failures and changes have non-obvious blast radius:
- No unified graph of contract/service/config relationships across runs and environments
- Hard to answer "what is affected?" for a failing contract, bad deploy, or config drift
- Incident/triage workflows lack structural context and prioritized impact paths
- Existing topology views (#082) are infra-focused, not dependency/change-impact focused

## Proposed Solution
Build a **Dependency & Impact Graph Explorer**:
- Multi-layer graph model (contracts, invocations, artifacts, services, configs, environments)
- Impact analysis modes: upstream/downstream traversal, blast-radius scoring, change simulation
- Temporal overlays showing when edges/nodes became unhealthy or changed
- Deep links from incidents, triage, CI, and run details into focused subgraphs

## Requirements
### Functional
- [ ] Graph ingestion/normalization from runs, traces, manifests, deploy metadata, and integration configs
- [ ] Interactive visualization: expand/collapse, clustering, path highlighting, filtering, search (#047/#082)
- [ ] Impact queries: "affected by node X", "root causes for Y", shortest/critical paths, blast-radius score
- [ ] Time slider/playback for dependency and health evolution; diff two snapshots
- [ ] Node/edge detail panels with evidence links (runs, logs, traces, issues, incidents) (#068/#075/#066/#062)
- [ ] Saved graph views, shareable links, and export (image/JSON) (#052/#056/#043)
- [ ] Permission-aware redaction of sensitive infra/contract metadata (#070/#022)

### Non-Functional
- [ ] Scales to 50k+ nodes/edges with level-of-detail rendering and progressive loading
- [ ] Deterministic layout options for reproducible snapshots/reviews
- [ ] Accessible graph navigation alternatives (tree/list view, keyboard traversal)
- [ ] Query/interaction latency targets met for common traversals

## Files to Modify / Create
```
apps/web/src/features/impact-graph/
├── ImpactGraphExplorer.tsx
├── graph/
│   ├── renderer.ts
│   ├── layout.ts
│   └── traversal.ts
├── panels/
│   ├── ImpactSummary.tsx
│   └── NodeEvidencePanel.tsx
└── hooks/useImpactGraph.ts

apps/web/src/app/analysis/impact-graph/page.tsx
apps/web/src/app/api/impact-graph/route.ts
docs/frontend/dependency-impact-graph.md
```

## Acceptance Criteria
- Users can visualize dependencies and compute understandable blast radius for failures/changes
- Graph views correlate with evidence and support incident/triage decisions
- Large graphs remain performant and accessible with shareable state

## PR Guide
- Branch: `issue/098-frontend-dependency-impact-graph`
- Phase 1: graph model + base visualization + traversal queries
- Phase 2: impact scoring/time overlays + evidence panels
- Phase 3: saved/share/export + integrations
- Phase 4: perf/a11y/permissions/tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
