---
name: "Frontend: Entity Knowledge Graph Explorer - Unified Relationships Across Runs, Contracts, Artifacts, Issues, and People"
description: "Build a knowledge graph explorer that models and visualizes relationships between all CrashLab entities to power discovery, impact analysis, and contextual investigation navigation"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
CrashLab data is richly interconnected, but users navigate siloed pages without a holistic relationship view:
- Hard to discover how runs, crashes, traces, seeds, contracts, issues, PRs, and incidents relate
- Context switching slows investigations and onboarding
- Existing graph views are domain-specific (topology, impact) and not entity-unified
- Search and recommendations lack relationship-aware exploration

## Proposed Solution
Implement an **Entity Knowledge Graph Explorer**:
- Unified graph schema and interactive visualization across core entities and relationships
- Faceted filtering, path queries ("how is A related to B"), and neighborhood expansion
- Context panels with evidence previews and quick actions per entity type
- Integration with semantic search and correlation workspaces for guided discovery (#099/#083)

## Requirements
### Functional
- [ ] Entity/relation ingestion model for runs, campaigns, crashes, clusters, traces, artifacts, seeds, contracts, issues, PRs, incidents, users/teams
- [ ] Graph UI with search-to-focus, expand/collapse, path finding, and saved subgraph views (#047)
- [ ] Relationship filters (type, confidence, time, workspace) and temporal evolution playback
- [ ] Entity detail side panel with summaries, key metrics, and deep links to native pages
- [ ] "Related entities" recommendations and path explanations; integration with semantic/similarity signals (#099/#089)
- [ ] Export/share subgraphs and embed snapshots in reports/incidents (#043/#092/#066)
- [ ] Permission-aware node/edge visibility and redaction (#070/#022)

### Non-Functional
- [ ] Scales to large graphs via incremental loading, clustering, and LOD rendering
- [ ] Deterministic subgraph serialization for saved views
- [ ] Accessible navigation alternatives (list/tree/path views)
- [ ] Query performance targets for common neighborhood/path operations

## Files to Modify / Create
```
apps/web/src/features/knowledge-graph/
├── KnowledgeGraphExplorer.tsx
├── graph/
│   ├── schema.ts
│   ├── queries.ts
│   └── renderer.ts
├── panels/EntityDetailPanel.tsx
├── PathFinder.tsx
└── hooks/useKnowledgeGraph.ts

apps/web/src/app/analysis/knowledge-graph/page.tsx
apps/web/src/app/api/knowledge-graph/route.ts
docs/frontend/entity-knowledge-graph.md
```

## Acceptance Criteria
- Users can explore and query relationships across entities to accelerate investigations
- Graph integrates with search/correlation and deep-links to authoritative views
- Performance, permissions, and accessibility requirements met

## PR Guide
- Branch: `issue/116-frontend-entity-knowledge-graph`
- Phase 1: schema/ingestion + base explorer + search/focus
- Phase 2: path queries/filters + detail panels/actions
- Phase 3: recommendations + saved/share/export integrations
- Phase 4: scaling, a11y/permissions, tests/docs

**Estimated effort:** 8+ weeks (200 pts)
