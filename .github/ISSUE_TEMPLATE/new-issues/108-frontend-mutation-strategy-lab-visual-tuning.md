---
name: "Frontend: Mutation Strategy Lab - Visual Tuning, A/B Comparison, and Feedback-Driven Fuzz Strategy Optimization"
description: "Create a visual mutation strategy lab for configuring, comparing, and tuning fuzz mutators/weights/schedules with coverage and crash-yield feedback loops"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Fuzzing effectiveness depends on mutation strategy choices, but tuning is opaque and largely config-driven:
- No visual feedback on how mutators/weights/schedules affect coverage, crash discovery, or cost
- Difficult to A/B test strategies across campaigns and attribute improvements
- Strategy presets and experiment history are not managed or reproducible
- Operators cannot safely roll out/rollback strategy changes with guardrails

## Proposed Solution
Build a **Mutation Strategy Lab**:
- Visual editor for mutator pipelines, weights, schedules, and constraints
- Experiment runs/A-B comparisons with coverage/crash-yield/cost metrics (#087/#019/#020)
- Recommendation insights based on historical outcomes and corpus characteristics (#086)
- Versioned presets, staged rollout controls, and integration with campaign designer (#085)

## Requirements
### Functional
- [ ] Strategy editor: mutator selection, weighting, sequencing, adaptive schedules, constraints
- [ ] Preset library with versioning, tagging, clone/diff, and workspace sharing (#052/#071)
- [ ] Experiment framework: define baselines/candidates, run comparisons, and view outcome dashboards
- [ ] Metrics: coverage delta, unique crashes, time-to-first-crash, exec/sec, cost/resource impact
- [ ] Recommendations and anomaly flags (e.g., starving mutators, diminishing returns)
- [ ] Apply/rollout strategy to campaigns with approvals, rollback, and audit trail (#070/#063/#049)
- [ ] Export strategy configs and experiment reports (#043/#092)

### Non-Functional
- [ ] Deterministic strategy serialization and reproducible experiment definitions
- [ ] Responsive UI for complex pipelines and large experiment histories
- [ ] Permission-aware controls for applying strategies to shared campaigns
- [ ] Accessible visual editors and data visualizations

## Files to Modify / Create
```
apps/web/src/features/strategy-lab/
├── MutationStrategyLab.tsx
├── PipelineEditor.tsx
├── StrategyPresets.tsx
├── ExperimentComparison.tsx
└── hooks/useStrategyLab.ts

apps/web/src/app/strategies/page.tsx
apps/web/src/app/api/strategies/route.ts
apps/web/src/app/api/strategies/experiments/route.ts
docs/frontend/mutation-strategy-lab.md
```

## Acceptance Criteria
- Users can design, compare, and optimize mutation strategies with measurable feedback
- Strategies are versioned, reproducible, and safely deployable to campaigns
- Experiment results are transparent and actionable

## PR Guide
- Branch: `issue/108-frontend-mutation-strategy-lab`
- Phase 1: strategy model/editor + presets
- Phase 2: experiment runs/comparison dashboards
- Phase 3: recommendations + rollout/rollback integrations
- Phase 4: governance, a11y/perf, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
