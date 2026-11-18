---
name: "Frontend: Chaos & Failure Injection Control UI - Safe Experiment Design, Guardrails, and Observability-Linked Resilience Testing"
description: "Deliver a frontend control plane for designing, running, and analyzing chaos/failure-injection experiments (RPC faults, latency, resource pressure) with strong guardrails and observability integration"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Resilience issues (RPC instability, timeouts, partial failures, resource pressure) are discovered late because controlled failure testing is hard to orchestrate and observe:
- No UI to define safe chaos experiments targeting fuzz pipelines, runners, or integrations
- Guardrails, blast-radius limits, and approvals are unclear or manual
- Observing experiment impact across runs, traces, incidents, and SLOs is fragmented
- Teams lack repeatable experiment templates and post-experiment analysis

## Proposed Solution
Build a **Chaos & Failure Injection Control UI**:
- Experiment designer for fault types (latency, errors, drops, throttling, resource constraints) with scoped targets
- Guardrail/approval workflows, dry-run validation, and emergency stop controls
- Live monitoring during experiments with automatic abort conditions
- Results analysis, reports, and integration with runbooks/incidents/release readiness

## Requirements
### Functional
- [ ] Experiment templates and composer: target selection (workspace/campaign/runner/integration), fault parameters, duration, schedules
- [ ] Guardrails: max blast radius, concurrency limits, environment allowlists, maintenance windows, required approvals (#070/#063/#095)
- [ ] Dry-run impact estimation and preflight checks; explicit start/stop/abort controls with audit trail
- [ ] Live experiment dashboard: injected faults, affected runs, error rates, latency/resource metrics, SLO impact (#059/#088/#050)
- [ ] Automatic halt rules based on thresholds (incident triggers, error spikes, data quality degradation) (#066/#084)
- [ ] Post-experiment analysis: timeline, correlated traces/logs/runs, findings, and follow-up actions (#067/#075/#062/#080)
- [ ] Saved experiments, versioning, share/export reports, and RBAC-scoped execution (#052/#043/#071)

### Non-Functional
- [ ] Safety-first defaults; no experiment execution without explicit confirmation and permissions
- [ ] Real-time control responsiveness and reliable abort signaling
- [ ] Deterministic experiment definitions and reproducible reports
- [ ] Accessible, high-clarity UI for high-risk operations

## Files to Modify / Create
```
apps/web/src/features/chaos/
├── ChaosControlCenter.tsx
├── ExperimentDesigner.tsx
├── GuardrailsPanel.tsx
├── LiveExperimentMonitor.tsx
├── ExperimentAnalysis.tsx
└── hooks/useChaosExperiments.ts

apps/web/src/app/resilience/chaos/page.tsx
apps/web/src/app/api/chaos/experiments/route.ts
apps/web/src/app/api/chaos/experiments/[id]/control/route.ts
docs/frontend/chaos-failure-injection-control-ui.md
```

## Acceptance Criteria
- Teams can safely design, run, monitor, and analyze failure-injection experiments
- Guardrails/approvals/abort mechanisms prevent uncontrolled impact
- Results integrate with observability, incidents, and remediation workflows

## PR Guide
- Branch: `issue/120-frontend-chaos-failure-injection-control-ui`
- Phase 1: experiment model/designer + guardrails/approvals
- Phase 2: execution controls + live monitoring
- Phase 3: analysis/reports + integrations (incidents/runbooks/releases)
- Phase 4: safety hardening, a11y, tests/docs

**Estimated effort:** 8+ weeks (200 pts)
