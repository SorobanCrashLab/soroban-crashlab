---
name: "Frontend: Experimentation & Feature Impact Analytics - Flag Rollouts, Cohorts, Funnels, and Regression Correlation"
description: "Build a frontend analytics and control surface for feature experiments and flag rollouts with cohort analysis, funnels, guardrail metrics, and correlation to crashes/performance/regressions"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Feature flags (#029) enable controlled rollouts, but teams lack visibility into real impact and safety:
- No unified view of flag exposure, adoption, and cohort behavior across workspaces/users
- Hard to correlate feature rollouts with crashes, regressions, latency, or error rates
- Experiment results and guardrail breaches are not surfaced in actionable dashboards
- Rollback/kill-switch decisions require manual data gathering across tools
- Privacy and permission constraints for analytics are not consistently enforced

## Proposed Solution
Implement **Experimentation & Feature Impact Analytics**:
- Rollout dashboards per flag/experiment with exposure timelines and cohort breakdowns
- Funnel and task-success analysis for key workflows (triage, replay, campaign setup)
- Guardrail monitoring correlating flags with reliability/perf/crash signals
- Decision support UI: promote/hold/rollback recommendations with evidence links
- Privacy-safe instrumentation governance and RBAC-aware reporting

## Requirements
### Functional
- [ ] Flag/experiment registry views: variants, targeting, rollout stages, owners, and change history
- [ ] Exposure and adoption metrics with cohort segmentation (workspace, role, environment, device)
- [ ] Funnel analysis for critical flows with drop-off visualization and comparison by variant
- [ ] Guardrail panels linking to crash/regression/perf/ops signals (#018/#019/#059/#066)
- [ ] Alerting hooks for guardrail breaches and automated rollback suggestions (#029/#049)
- [ ] Drill-down from charts to representative sessions/runs/events (privacy-safe)
- [ ] Export/share reports and annotate rollout decisions (#043/#069)
- [ ] Admin controls for metric definitions, sampling, and data retention

### Non-Functional
- [ ] Privacy-by-design: consent/opt-out respect, PII minimization, aggregation thresholds
- [ ] Accurate time alignment and statistically sound comparison displays (confidence/uncertainty cues)
- [ ] Scalable analytics queries and responsive visualizations for large datasets
- [ ] Permission-aware access to experiment data and sensitive cohorts (#070)

## Files to Modify / Create
```
apps/web/src/features/experimentation/
├── ExperimentsDashboard.tsx
├── FlagImpactView.tsx
├── CohortAnalysis.tsx
├── FunnelAnalysis.tsx
├── GuardrailsPanel.tsx
└── hooks/useExperimentAnalytics.ts

apps/web/src/app/experiments/page.tsx
apps/web/src/app/api/experiments/metrics/route.ts
apps/web/src/app/api/experiments/guardrails/route.ts
apps/web/src/lib/analytics/
├── experimentation.ts
├── cohorts.ts
└── privacy.ts
docs/frontend/experimentation-feature-impact.md
```

## Acceptance Criteria
- Teams can assess rollout safety and product impact from a single, trusted UI
- Guardrail regressions are detectable and traceable to evidence and rollout changes
- Reports/decisions are shareable and auditable with privacy controls enforced
- Performance and permission requirements met for production-scale usage

## PR Guide
- Branch: `issue/078-frontend-experimentation-impact-analytics`
- Phase 1: metric models + flag/experiment dashboards
- Phase 2: cohort/funnel analysis + drill-downs
- Phase 3: guardrails correlation + alert/rollback decision support
- Phase 4: privacy/governance hardening, exports, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
