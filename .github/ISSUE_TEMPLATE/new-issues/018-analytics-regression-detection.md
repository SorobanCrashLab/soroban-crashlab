---
name: "Analytics: Regression Detection Engine - Automated Crash Regression Detection with Bisect, Notification & Tracking"
description: "Build an automated regression detection system that identifies new crashes, bisects to find introducing commit, tracks regression lifecycle, and integrates with notification systems"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Regressions are detected manually. Need:
- Automated comparison: New run vs. baseline → new crashes
- Git bisect integration: Find exact commit introducing crash
- Regression lifecycle: New → Confirmed → Bisected → Fixed → Verified
- Notifications: Slack, PagerDuty, Email, Webhook on new regression
- Dashboard: Regression trends, MTTR, fix verification

## Current State

- `apps/web/src/lib/regression_grouping.ts` — Basic grouping
- `apps/web/src/lib/regression_group.ts` — Group model
- `apps/web/src/app/regression-suite/` — Manual suite runs
- No automated detection, no bisect, no lifecycle tracking

## Proposed Solution

**Regression Detection Engine** with automated analysis pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Regression Detection                                    [🔄 Auto-scan]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  NEW REGRESSIONS (3)                                                    │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🔴 SIG-REENTRANCY-001  |  mainnet-fuzz  |  Commit: a1b2c3d      │  │ │
│  │  │  First seen: Run #4523  |  Bisect: 3 commits left  |  ETA: 15m   │  │ │
│  │  │  [View Bisect] [View Run] [Acknowledge] [Assign]                 │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟡 SIG-OVERFLOW-042    |  testnet-reg   |  Commit: TBD          │  │ │
│  │  │  First seen: Run #4519  |  Bisect: Queued  |  [Start Bisect]     │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟢 SIG-ACCESS-007       |  staging-daily |  FIXED v2.1.4        │  │ │
│  │  │  Fixed in: commit f3e4d5  |  Verified: Run #4530 ✓              │  │ │
│  │  │  [View Fix] [View Verification]                                  │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  REGRESSION TRENDS                                                      │ │
│  │  ████████████░░░░░░░░░░  New/Month        ████████░░░░░░░░░░  MTTR: 2.3d│ │
│  │  [Configure Baselines] [Notification Rules] [Export Report]            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Baseline Management**: Define baseline runs per campaign (latest stable, tagged release, manual)
- [ ] **Automated Comparison**: New run vs. baseline → signature diff (new, fixed, persistent)
- [ ] **Signature Matching**: `signature_comparison.rs` → fuzzy match (threshold configurable)
- [ ] **Git Bisect Integration**: 
  - `cargo-bisect` or custom: checkout commit → replay crash → pass/fail
  - Parallel bisect (multiple workers)
  - Bisect progress tracking + ETA
- [ ] **Regression Lifecycle**: 
  - States: `detected` → `bisecting` → `bisected` → `fixing` → `fixed` → `verified`
  - Transitions: Auto (bisect complete) + Manual (fix deployed)
- [ ] **Notifications**: On `detected` and `fixed` → Slack, PD, Email, Webhook (#011, #013)
- [ ] **Fix Verification**: Auto-replay on merged PR → confirm crash gone
- [ ] **Dashboard**: Trends (new/month, MTTR, fix rate), search, export

### Non-Functional

- [ ] Comparison (10k crashes) < 5s
- [ ] Bisect (100 commits) < 30min (parallel)
- [ ] False positive rate < 5% (signature matching tuned)
- [ ] Scalable: 100+ campaigns, 1000+ runs/day
- [ ] Audit trail: All state changes logged with user/timestamp

## Files to Modify / Create

```
apps/web/src/features/analytics/regression/
├── RegressionEngine.tsx                # Main dashboard
├── RegressionEngine.test.tsx
├── detection/
│   ├── ComparisonEngine.ts             # Run vs baseline diff
│   ├── SignatureMatcher.ts             # Fuzzy matching (port from Rust)
│   ├── BaselineManager.ts              # CRUD baselines
│   ├── NewCrashDetector.ts             # New signatures
│   ├── FixedCrashDetector.ts           # Disappeared signatures
│   └── useRegressionDetection.ts
├── bisect/
│   ├── BisectOrchestrator.ts           # Coordinate bisect jobs
│   ├── BisectWorker.ts                 # Single bisect (Git + replay)
│   ├── GitBisect.ts                    # `git bisect` automation
│   ├── ReplayValidator.ts              # Run crash → pass/fail
│   ├── ParallelBisect.ts               # Multiple workers
│   └── BisectProgress.ts               # Track + ETA
├── lifecycle/
│   ├── RegressionStateMachine.ts       # State transitions
│   ├── RegressionStore.ts              # Persistence + audit
│   ├── FixVerifier.ts                  # Auto-verify on PR merge
│   └── NotificationTrigger.ts          # On state change
├── ui/
│   ├── RegressionList.tsx              # Table with filters
│   ├── RegressionDetail.tsx            # Bisect progress, timeline
│   ├── BisectProgress.tsx              # Live progress bar
│   ├── BaselineConfig.tsx              # Manage baselines
│   └── TrendsDashboard.tsx             # Charts + metrics
└── hooks/
    ├── useRegressionEngine.ts
    ├── useBisect.ts
    └── useRegressionNotifications.ts
```

**Core** (enhance existing):
```
contracts/crashlab-core/src/
├── regression_detection.rs             # New module
├── signature_comparison.rs             # Enhance for fuzzy match
├── bisect/
│   ├── git_bisect.rs                   # Git automation
│   ├── replay_validator.rs             # Replay → pass/fail
│   └── bisect_orchestrator.rs          # Coordination
└── regression_grouping.rs              # Enhance with lifecycle
```

**API** (new):
```
apps/web/src/app/api/regressions/
├── route.ts                            # CRUD + list
├── detect/route.ts                     # Trigger detection
├── bisect/route.ts                     # Start/status bisect
├── baselines/route.ts                  # Baseline management
└── trends/route.ts                     # Aggregated metrics
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Detect new regression | < 5s after run | E2E |
| Bisect 100 commits | < 30min (4 workers) | Benchmark |
| False positive rate | < 5% | Validation set |
| Fix verification | Auto on PR merge | E2E |
| Notification delivery | < 10s | Integration |
| Dashboard load | < 2s | Benchmark |

## PR Guide

- Branch: `issue/018-regression-detection-engine`
- Phase 1: Baseline + comparison + detection (Core + Web)
- Phase 2: Git bisect integration + parallel workers
- Phase 3: Lifecycle + notifications + fix verification
- Phase 4: Dashboard + trends + configuration
- **Dependencies**: `simple-git` (Git automation), existing replay system
- Update `docs/ARCHITECTURE.md` with regression detection architecture

## Related Issues

- Depends on: #002 (SSE for bisect progress), #006 (comparison for baseline diff), #011/#013 (notifications)
- Blocks: #019 (performance regression detection)
- Related: `regression_grouping.ts`, `regression_group.ts`, `signature_comparison.rs` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Git bisect automation / `git bisect run`
- Crash signature matching / fuzzy hashing
- State machines for lifecycle management
- Distributed job orchestration (bisect workers)

**Key challenges:**
- Signature matching: Balance false positives vs. false negatives
- Bisect reproducibility: Same crash must replay deterministically
- Parallel bisect: Work distribution, result aggregation
- Fix verification: Trigger on PR merge (GitHub webhook)

**Learning resources:**
- Git bisect: https://git-scm.com/docs/git-bisect
- Fuzzy matching: https://github.com/facebookresearch/fasttext (or simpler)
- Job queues: BullMQ, Redis Streams

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes