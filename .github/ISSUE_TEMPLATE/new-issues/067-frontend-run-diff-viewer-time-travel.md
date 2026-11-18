---
name: "Frontend: Run Diff & Time-Travel Viewer - Deterministic State Comparison, Trace Alignment, and Visual Replay Deltas"
description: "Build a deep run diff viewer that compares executions across seeds, commits, campaigns, and environments with aligned traces, state snapshots, artifact diffs, and time-travel navigation for root-cause analysis"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

CrashLab users can inspect individual runs, but debugging non-determinism, regressions, and environment drift requires comparing multiple runs in context. Today comparison and replay surfaces are fragmented and shallow:
- No unified diff across execution traces, host events, ledger/state snapshots, logs, and artifacts
- No trace alignment for runs with different lengths, retries, or checkpoint boundaries
- No "time-travel" UX to scrub synchronized states and inspect causal divergence points
- Limited support for comparing mock vs host vs RPC executions and baseline vs candidate campaigns
- Difficult to share an exact diff view (selected frames, filters, annotations) with teammates

## Proposed Solution

Deliver a **Run Diff & Time-Travel Workbench**:
- Multi-run diff engine UI (2–4 runs) with semantic alignment (instruction/event/phase anchors)
- Side-by-side and unified diff modes for traces, state snapshots, call trees, logs, and artifacts
- Divergence detection that highlights first-cause candidates and confidence scoring
- Time-travel scrubber with synchronized playback, bookmarks, and annotation overlays
- Shareable deep links and exportable diff reports for triage/regression workflows

## Requirements

### Functional
- [ ] Select runs by ID, campaign baseline/candidate, commit, environment, or replay bundle
- [ ] Align traces using deterministic anchors (seed index, instruction pointer, host call signature, checkpoint ID) with fallback heuristics
- [ ] Diff views: timeline, call graph, structured state JSON/tree, logs, and artifact metadata/content previews (#044)
- [ ] Detect and surface first divergence point, divergence type (state, control flow, resource, auth, environment), and impacted downstream events
- [ ] Time-travel controls: play/pause/step, speed, jump-to-divergence, synchronized multi-run cursor (#009)
- [ ] Filters: event type, severity, subsystem, address/contract, budget/resource thresholds, noise suppression
- [ ] Annotations/bookmarks on diff frames with comments and triage links (#003/#061)
- [ ] Shareable URL state and export (JSON diff summary + PDF/HTML report) (#056/#043)

### Non-Functional
- [ ] Render and navigate 100k+ trace events via virtualization/windowing without UI jank
- [ ] Diff computation offloaded to Web Workers/WASM where feasible; UI remains responsive
- [ ] Deterministic diff output for identical inputs; stable ordering and canonical serialization
- [ ] Accessible keyboard navigation, focus management, and screen-reader labels for diff semantics
- [ ] Permission-aware access to sensitive artifacts/log segments (#022/#023)

## Files to Modify / Create
```
apps/web/src/features/runs/diff/
├── RunDiffWorkbench.tsx
├── RunDiffToolbar.tsx
├── TraceAlignmentEngine.ts
├── DivergenceAnalyzer.ts
├── views/
│   ├── TimelineDiffView.tsx
│   ├── StateDiffView.tsx
│   ├── LogDiffView.tsx
│   └── ArtifactDiffView.tsx
├── time-travel/
│   ├── TimeTravelController.ts
│   └── SyncCursor.ts
└── hooks/useRunDiff.ts

apps/web/src/app/runs/compare/[...ids]/page.tsx
apps/web/src/app/api/runs/diff/route.ts
apps/web/src/lib/diff/
├── trace-align.ts
├── semantic-diff.ts
└── report.ts
docs/frontend/run-diff-time-travel.md
```

## Acceptance Criteria
- Users can compare runs and identify first meaningful divergence with supporting evidence
- Time-travel navigation stays synchronized across selected runs and diff panels
- Diff views handle large traces/artifacts with responsive interactions
- Share/export preserves exact diff context and respects permissions
- Tests cover alignment correctness, divergence detection, and URL-state restoration

## PR Guide
- Branch: `issue/067-frontend-run-diff-time-travel`
- Phase 1: alignment/diff domain model + API + base UI
- Phase 2: multi-panel diff views + divergence detection
- Phase 3: time-travel sync, annotations, share/export
- Phase 4: performance hardening (worker/virtualization), a11y, tests
- Coordinate with #006/#009/#036/#044/#056; do not duplicate existing comparison primitives

**Estimated effort:** 6-8 weeks (200 pts)
