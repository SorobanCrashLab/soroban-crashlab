---
name: "Analytics: Performance Regression Detection - Automated Benchmark Comparison with Statistical Significance & CI/CD Integration"
description: "Detect performance regressions (gas usage, execution time, memory) by comparing runs against baselines with statistical rigor, integrated into CI/CD pipelines"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Performance regressions (gas +20%, exec time 2x) go unnoticed. Need:
- Automated benchmark runs on every PR / scheduled
- Statistical comparison (t-test, Mann-Whitney) with confidence intervals
- Multi-metric: gas, execution time, memory, CPU, storage
- CI/CD integration: Fail build on regression, comment on PR
- Historical tracking with trend visualization

## Current State

- `apps/web/src/app/resource-fee-insight-utils.ts` — Gas analysis
- `apps/web/src/lib/perf-harness.mjs` — Benchmark harness
- No statistical comparison, no CI integration, no multi-metric

## Proposed Solution

**Performance Regression Detection** with statistical rigor:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Performance Regressions                              [📊 CI Status]       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  PR #234  |  Commit: a1b2c3d  |  Branch: feat/optimize-storage         │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  METRIC          │  BASELINE  │  CURRENT  │  Δ       │  P-VALUE  │  │ │
│  │  │  Gas (median)    │  847,231   │  912,456  │  +7.7%   │  0.003 ** │  │ │
│  │  │  Exec time (p95) │  1.23s     │  1.41s    │  +14.6%  │  0.012 *  │  │ │
│  │  │  Memory (peak)   │  234 MB    │  241 MB   │  +3.0%   │  0.156    │  │ │
│  │  │  CPU (avg)       │  45%       │  48%      │  +6.7%   │  0.041 *  │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ⚠️  REGRESSIONS DETECTED: Gas (+7.7%, p=0.003), Exec time (+14.6%, p=0.012)│ │
│  │  [Fail Build] [View Details] [Download Report]                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  HISTORICAL TRENDS (Gas Median)                                         │ │
│  │  ████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │ │
│  │  ▲ Regression v2.1.3          ▲ Fixed v2.1.4                           │ │
│  │  [Statistical Process Control] [CUSUM Chart] [Export CSV]              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Benchmark Suite**: Define benchmark campaigns (seeds, config, iterations)
- [ ] **Scheduled Runs**: Cron (nightly) + PR-triggered (GitHub Actions)
- [ ] **Statistical Engine**: 
  - Parametric: t-test (paired/unpaired), ANOVA
  - Non-parametric: Mann-Whitney U, Wilcoxon signed-rank
  - Effect size: Cohen's d, Cliff's delta
  - Confidence intervals: Bootstrap (1000 resamples)
  - Multiple comparison correction: Bonferroni, Benjamini-Hochberg
- [ ] **Multi-metric**: Gas (mean, median, p95, p99), Exec time, Memory, CPU, Storage I/O
- [ ] **Baseline Management**: 
  - Auto: Latest main branch run
  - Manual: Tagged release, specific run
  - Rolling: Last N runs (configurable)
- [ ] **CI/CD Integration**: 
  - GitHub Action: `sorobancrashlab/perf-regression@v1`
  - Fails build if regression (configurable threshold + p-value)
  - PR comment with summary table
  - Artifact upload (full report JSON/HTML)
- [ ] **Trend Visualization**: 
  - Time series with regression markers
  - SPC charts (control limits)
  - CUSUM for gradual drift detection
- [ ] **Alerting**: On sustained regression (configurable window)

### Non-Functional

- [ ] Benchmark run: < 30min (configurable seeds/iterations)
- [ ] Statistical analysis: < 10s for 1000 samples x 10 metrics
- [ ] False positive rate: < 1% (with correction)
- [ ] CI action overhead: < 2min (excluding benchmark)
- [ ] Historical storage: 1 year granular, 5 years aggregated

## Files to Modify / Create

```
apps/web/src/features/analytics/perf-regression/
├── PerfRegressionDashboard.tsx         # Main UI
├── PerfRegressionDashboard.test.tsx
├── statistical/
│   ├── StatisticalEngine.ts            # Core tests (port from Python/R)
│   ├── TTest.ts                        # t-test implementations
│   ├── MannWhitneyU.ts                 # Non-parametric
│   ├── EffectSize.ts                   # Cohen's d, Cliff's delta
│   ├── BootstrapCI.ts                  # Bootstrap confidence intervals
│   ├── MultipleCorrection.ts           # Bonferroni, BH
│   └── StatisticalEngine.test.ts
├── benchmarks/
│   ├── BenchmarkSuite.ts               # Define + run benchmarks
│   ├── BenchmarkConfig.ts              # Seeds, iterations, metrics
│   ├── BaselineManager.ts              # Auto/manual/rolling
│   ├── ComparisonEngine.ts             # Current vs baseline
│   └── useBenchmarks.ts
├── ci/
│   ├── GitHubAction.ts                 # Action entrypoint
│   ├── ActionInputs.ts                 # Thresholds, metrics, baseline
│   ├── PRCommenter.ts                  # Post results on PR
│   ├── BuildFailer.ts                  # Exit codes
│   └── ArtifactUploader.ts
├── trends/
│   ├── TrendAnalyzer.ts                # Time series analysis
│   ├── SPCCharts.ts                    # Control charts
│   ├── CUSUMDetector.ts                # Drift detection
│   └── TrendVisualization.tsx          # Charts (uPlot)
└── hooks/
    ├── usePerfRegression.ts
    ├── useBenchmarkSuite.ts
    └── useTrends.ts
```

**GitHub Action** (new repo or subdirectory):
```
.github-actions/perf-regression/
├── action.yml
├── package.json
├── src/
│   ├── main.ts
│   ├── benchmark-runner.ts
│   ├── statistical-analysis.ts
│   ├── pr-comment.ts
│   └── types.ts
└── dist/
```

**Core** (enhance):
```
contracts/crashlab-core/src/
├── perf_benchmark.rs                   # Benchmark runner
├── perf_metrics.rs                     # Metric collection
└── statistical.rs                      # Statistical functions (or WASM)
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Benchmark run (100 seeds) | < 30min | Benchmark |
| Statistical analysis | < 10s | Unit |
| CI action on PR | Comment + fail | E2E |
| False positive rate | < 1% | Simulation |
| Trend detection (CUSUM) | Detect 5% drift in 20 runs | Unit |
| PR comment format | Valid markdown | Unit |

## PR Guide

- Branch: `issue/019-perf-regression-detection`
- Phase 1: Statistical engine + benchmark suite + baseline
- Phase 2: Comparison engine + trend analysis + visualization
- Phase 3: GitHub Action + PR integration + artifact upload
- Phase 4: Alerting + SPC/CUSUM + historical storage
- **Dependencies**: `simple-statistics` or custom, `uPlot`, GitHub Action toolkit
- Consider WASM for statistical engine (shared Core/Web)
- Update `docs/ARCHITECTURE.md` with perf regression architecture

## Related Issues

- Depends on: #002 (SSE for live benchmark progress), #018 (regression detection patterns)
- Blocks: #020 (resource optimization recommendations)
- Related: `perf-harness.mjs`, `resource-fee-insight-utils.ts` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Statistical hypothesis testing (t-test, Mann-Whitney, bootstrap)
- Effect sizes and confidence intervals
- Multiple comparison corrections
- GitHub Actions development
- Time series analysis (SPC, CUSUM)

**Key challenges:**
- Statistical validity: Proper test selection, assumptions checking
- Benchmark noise: Warmup, GC, system noise → need iterations
- Baseline drift: When to update baseline (auto vs manual)
- CI integration: Flaky benchmarks → retry logic

**Learning resources:**
- Statistical tests: https://www.statology.io/
- Bootstrap CI: https://cran.r-project.org/web/packages/boot/boot.pdf
- CUSUM: https://en.wikipedia.org/wiki/CUSUM
- GitHub Actions: https://docs.github.com/en/actions/creating-actions

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes