---
name: "Frontend: Cross-Run Comparison - Side-by-Side Diff View with Unified Metrics, Artifact Diff & Replay Sync"
description: "Build a comprehensive run comparison tool enabling side-by-side analysis of 2-5 runs with synchronized replay scrubbing, metric delta visualization, and artifact-level diffing"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Engineers manually compare runs by opening multiple tabs. Current `add-run-comparison-side-by-side-view.tsx` is basic:
- Only 2 runs
- Static metric tables (no delta highlighting)
- No artifact diff (byte-level, structural)
- No synchronized replay timeline scrubbing
- No campaign-level comparison (aggregate)

## Current State

- `apps/web/src/features/runs/add-run-comparison-side-by-side-view.tsx` — basic 2-run
- `apps/web/src/features/runs/add-run-comparison.tsx` — entry point
- `run-comparison-side-by-side-view-utils.ts` — minimal utilities
- No diffing engine, no replay sync

## Proposed Solution

**Multi-Run Comparison Workbench** with 4 synchronized panels:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Compare: run_abc123 (baseline)  vs  run_def456 (candidate)  [+ Add Run]   │
│  ┌─────────────────────┬─────────────────────┬─────────────────┬───────────┐ │
│  │  METRICS DELTA      │  ARTIFACT DIFF      │  REPLAY SYNC    │  SUMMARY  │ │
│  │  ┌────────────────┐ │  ┌────────────────┐ │  ┌────────────┐ │  📊 3     │ │
│  │  │ gas_used    ▼  │ │  ▸ crash.bin     │ │  ████████░░  │ │  crashes  │ │
│  │  │ 847,231      │ │    ▼ 23 bytes    │ │  ░░░░░░░░░░  │ │           │ │
│  │  │ 823,102  -2.8%│ │    ▼ 0.04%     │ │  ◀────────▶  │ │  ⚡ 12%   │ │
│  │  ├────────────────┤ │  ▸ storage.json  │ │  [||] Play  │ │  faster   │ │
│  │  │ exec_time  ▲  │ │    ▼ 1.2 KB    │ │  0:12 / 0:45 │ │           │ │
│  │  │ 1.23s        │ │    ▼ 4.1%      │ │              │ │  🔴 2     │ │
│  │  │ 1.41s  +14.6%│ │                  │ │  Linked:     │ │  new      │ │
│  │  └────────────────┘ │  [Byte Diff]     │ │  ✓ Crash @   │ │  crashes  │ │
│  │                     │  [Struct Diff]   │ │    0:12.3    │ │           │ │
│  └─────────────────────┴──────────────────┴────────────────┴───────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **2-5 run comparison**: Add/remove runs, drag to reorder, pin baseline
- [ ] **Metrics delta table**: All numeric metrics with ▲/▼ % change, color coding (red=worse, green=better)
- [ ] **Artifact diff**:
  - Binary: byte-level diff (bsdiff/hexdump), size delta
  - JSON: structural diff (added/removed/modified keys, semantic diff)
  - Text: unified diff with syntax highlighting
- [ ] **Replay synchronization**: Shared timeline scrubber → all runs seek to same relative timestamp
- [ ] **Crash correlation**: Auto-match crashes across runs by signature/fingerprint
- [ ] **Campaign comparison mode**: Aggregate metrics across campaign runs (median, p50, p95, p99)
- [ ] **Export**: PDF report, CSV metrics, diff patches
- [ ] **Deep link**: URL encodes run IDs + panel state + baseline selection

### Non-Functional

- [ ] Artifact diff (10MB binary) < 2s (Web Worker + wasm bsdiff)
- [ ] Metric delta calc (1000 metrics) < 50ms
- [ ] Replay sync latency < 50ms (local) / < 200ms (remote)
- [ ] Bundle size < 50KB gzip (code-split: diff workers lazy-loaded)
- [ ] Accessible: Keyboard nav between panels, screen reader reads deltas

## Files to Modify / Create

```
apps/web/src/features/runs/comparison/
├── ComparisonWorkbench.tsx             # Main 4-panel layout
├── ComparisonWorkbench.test.tsx
├── panels/
│   ├── MetricsDeltaPanel.tsx           # Delta table with sparklines
│   ├── ArtifactDiffPanel.tsx           # Tabbed: binary/JSON/text
│   ├── ReplaySyncPanel.tsx             # Shared timeline + linked crashes
│   └── SummaryPanel.tsx                # Crash count, new/removed, trends
├── diffing/
│   ├── DiffEngine.ts                   # Orchestrator
│   ├── BinaryDiffWorker.ts             # Web Worker: bsdiff (wasm)
│   ├── JSONDiffWorker.ts               # Web Worker: deep-diff
│   ├── TextDiffWorker.ts               # Web Worker: diff-match-patch
│   ├── diffWorkers.ts                  # Worker pool management
│   └── wasm/
│       └── bsdiff.wasm                 # Compiled bsdiff (Rust → wasm)
├── sync/
│   ├── ReplaySyncController.ts         # Shared timeline state
│   ├── CrashCorrelator.ts              # Match crashes by signature
│   └── useReplaySync.ts                # Hook for components
├── campaign/
│   ├── CampaignComparisonMode.tsx      # Aggregate view
│   ├── AggregationEngine.ts            # Median, percentiles, trends
│   └── CampaignSelector.tsx            # Multi-campaign picker
├── export/
│   ├── PDFExporter.ts                  # @react-pdf/renderer
│   ├── CSVExporter.ts
│   └── PatchExporter.ts                # Unified diff patches
└── hooks/
    ├── useComparison.ts                # Main state + actions
    ├── useArtifactDiff.ts              # Lazy diff loading
    └── useComparisonURL.ts             # URL sync
```

**WASM Module** (new):
```
contracts/crashlab-core/wasm-diff/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── bsdiff.rs                       # bsdiff algorithm
│   └── bindings.rs                     # wasm-bindgen exports
└── build.sh                            # wasm-pack build
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Compare 3 runs (100MB artifacts) | < 5s total | E2E |
| Binary diff (10MB) | < 2s | Benchmark |
| JSON diff (5MB) | < 500ms | Benchmark |
| Replay sync (3 runs) | < 50ms latency | E2E |
| Campaign aggregate (50 runs) | < 1s | Benchmark |
| Export PDF (10 runs) | < 3s | E2E |

## PR Guide

- Branch: `issue/006-cross-run-comparison-workbench`
- Phase 1: Metrics delta + basic artifact diff (text/JSON)
- Phase 2: Binary diff WASM + replay sync
- Phase 3: Campaign mode + crash correlation
- Phase 4: Export + URL deep linking
- **Dependencies**: `wasm-pack`, `bsdiff` crate, `diff-match-patch`, `@react-pdf/renderer`
- Update `docs/ARCHITECTURE.md` with comparison architecture

## Related Issues

- Depends on: #001 (virtualized table for run selection), #002 (replay streaming)
- Blocks: #014 (regression detection via comparison)
- Related: `run-comparison-side-by-side-view.tsx` (legacy — replace)

## Contributor Notes

**Start here if:** You have experience with:
- WebAssembly (Rust → wasm via wasm-pack)
- Diff algorithms (bsdiff, Myers, patience diff)
- Web Workers for heavy computation
- Timeline/video scrubber synchronization
- Statistical aggregation (percentiles, trends)

**Key challenges:**
- WASM binary size optimization (target < 200KB)
- Worker pool management (reuse, terminate, error handling)
- Replay sync: Relative time vs. absolute time vs. instruction count
- Crash correlation: Fuzzy matching on signatures

**Learning resources:**
- bsdiff: https://github.com/mendsley/bsdiff
- wasm-pack: https://rustwasm.github.io/wasm-pack/
- diff-match-patch: https://github.com/google/diff-match-patch
- React PDF: https://react-pdf.org/

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes — WASM expert on team