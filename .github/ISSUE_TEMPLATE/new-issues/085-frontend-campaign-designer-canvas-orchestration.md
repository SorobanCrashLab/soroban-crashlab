---
name: "Frontend: Campaign Designer Canvas - Visual Fuzz Campaign Orchestration, Strategy Graphs, and Dependency-Aware Scheduling"
description: "Build a visual campaign designer for composing fuzzing strategies, seed pipelines, target matrices, and execution dependencies with validation, simulation previews, and reusable blueprints"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Campaign setup is complex and error-prone when expressed only through forms/config files. Users need to orchestrate multi-stage fuzzing workflows (seed generation, mutation profiles, host/RPC targets, replay gates, regression promotion) with clear dependencies and guardrails.
- No visual representation of campaign stages, dependencies, and failure/branch paths
- Difficult to validate resource budgets, coverage goals, and environment compatibility before launch
- Reuse of proven campaign patterns is manual; no blueprint library or parameterized templates
- Limited visibility into how strategy choices map to expected runtime behavior and cost

## Proposed Solution
Deliver a **Campaign Designer Canvas**:
- Node-based graph editor for campaign stages (ingest, mutate, execute, classify, minimize, replay, report)
- Strong validation/simulation (dry-run) with cost/time/budget estimates and constraint checks
- Blueprint library with versioning, parameter presets, and workspace sharing
- One-click launch, export-to-config, and live linkage to running campaign telemetry

## Requirements
### Functional
- [ ] Drag-and-drop canvas with typed nodes/edges, dependency rules, and conditional branches
- [ ] Node inspectors for targets, strategies, budgets, quotas, environments, and artifact policies
- [ ] Preflight validation: missing inputs, incompatible runners, budget conflicts, unsafe settings
- [ ] Dry-run/simulation preview with estimated duration/cost/resource envelope and warnings
- [ ] Blueprint save/load/clone/version, parameterization, and import/export (YAML/JSON)
- [ ] Launch from canvas with generated config snapshot and traceable provenance
- [ ] Live status overlay for active campaigns (stage progress, failures, queue depth) (#017/#050)
- [ ] Deep links and annotations for review/collaboration (#056/#069)

### Non-Functional
- [ ] Performant graph editing for 200+ nodes; virtualization and incremental validation
- [ ] Deterministic serialization for diffing/version control
- [ ] Accessible canvas controls (keyboard navigation, focus order, screen-reader labels)
- [ ] Permission-aware launch/edit/publish actions (#070)

## Files to Modify / Create
```
apps/web/src/features/campaigns/designer/
├── CampaignDesignerCanvas.tsx
├── nodes/
├── edges/
├── inspectors/
├── validation/
├── simulation/
└── hooks/useCampaignDesigner.ts

apps/web/src/app/campaigns/designer/page.tsx
apps/web/src/app/api/campaigns/blueprints/route.ts
apps/web/src/lib/campaigns/designer/
├── schema.ts
├── serialize.ts
└── simulate.ts
docs/frontend/campaign-designer-canvas.md
```

## Acceptance Criteria
- Users can visually compose, validate, simulate, and launch complex campaigns
- Blueprints are reusable/versioned and produce deterministic configs
- Live campaign state maps back to canvas nodes accurately
- A11y, permissions, and performance targets met

## PR Guide
- Branch: `issue/085-frontend-campaign-designer-canvas`
- Phase 1: graph model/editor + schema/serialization
- Phase 2: validation/simulation + blueprint library
- Phase 3: launch integration + live telemetry overlay
- Phase 4: a11y/perf/tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
