---
name: "Testing: Comprehensive E2E Test Framework - Critical Path Coverage, Visual Regression, Performance & Chaos Testing"
description: "Build a production-grade E2E testing framework covering all critical user paths, visual regression baselines, performance budgets, and chaos engineering scenarios"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

E2E test coverage is incomplete for critical paths:
- Missing coverage for collaborative features, real-time updates, complex filters
- No visual regression testing for key pages
- No performance regression tests in E2E
- No chaos testing (network failures, slow APIs, partial outages)
- Flaky test management not systematic

## Proposed Solution

**Comprehensive E2E Test Platform**:

- **Critical Path Suites**: Onboarding, run creation, triage workflow, comparison, export, integrations
- **Visual Regression**: Screenshot baselines for all key pages/components with diff review
- **Performance Tests**: Lighthouse CI + custom metrics (LCP, FID, CLS, TTI) in E2E
- **Chaos Testing**: Network failure injection, slow API simulation, SSE disconnects
- **Flaky Test Management**: Quarantine system, retry tracking, flake detection dashboard
- **Test Data Management**: Seed factories, deterministic fixtures, cleanup strategies

## Requirements

### Functional
- [ ] E2E suites for: dashboard, runs list/detail, triage, comparison, replay, campaigns, integrations, settings, search
- [ ] Visual regression baselines for 30+ key page states (light/dark, responsive)
- [ ] Performance assertions: LCP < 2.5s, CLS < 0.1, TTI < 3.5s on key pages
- [ ] Chaos scenarios: API timeout, 500 errors, SSE disconnect, slow network, partial data
- [ ] Test data factories with deterministic seeding
- [ ] Flaky test quarantine with automatic detection (>10% failure rate = quarantine)
- [ ] Parallel test execution with proper isolation

### Non-Functional
- [ ] Full E2E suite < 15min in CI (parallelized)
- [ ] Flake rate < 2% across all suites
- [ ] Visual diff review workflow in PRs
- [ ] Test reports with screenshots, traces, videos on failure

## Files to Modify / Create
```
apps/web/e2e/
├── critical-paths/
│   ├── onboarding.spec.ts
│   ├── run-lifecycle.spec.ts
│   ├── triage-workflow.spec.ts
│   ├── comparison-workflow.spec.ts
│   ├── campaign-management.spec.ts
│   └── integration-setup.spec.ts
├── visual/
│   ├── baselines/ (screenshots)
│   └── visual-regression.spec.ts
├── performance/
│   ├── lighthouse.spec.ts
│   └── metrics.spec.ts
├── chaos/
│   ├── network-failure.spec.ts
│   ├── slow-api.spec.ts
│   ├── sse-disconnect.spec.ts
│   └── partial-outage.spec.ts
├── fixtures/
│   ├── factories.ts
│   ├── seed-data.ts
│   └── cleanup.ts
├── utils/
│   ├── chaos-injector.ts
│   ├── perf-collector.ts
│   └── visual-diff.ts
└── playwright.config.ts (enhance)

.github/workflows/e2e-comprehensive.yml
scripts/check-flaky-tests.mjs (enhance)
```

## Acceptance Criteria
- Critical path coverage for all major user workflows
- Visual regression catches unintended UI changes
- Performance budgets enforced in CI
- Chaos tests validate graceful degradation
- Flake rate tracked and quarantined automatically

## PR Guide
- Branch: `issue/031-testing-comprehensive-e2e`
- Phase 1: Test data factories + critical path suites
- Phase 2: Visual regression + performance tests
- Phase 3: Chaos testing + flake management
- Phase 4: CI integration + reporting

**Estimated effort:** 5-6 weeks