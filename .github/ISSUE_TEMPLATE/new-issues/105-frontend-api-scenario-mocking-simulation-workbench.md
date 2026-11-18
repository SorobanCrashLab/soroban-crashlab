---
name: "Frontend: API & Scenario Mocking Simulation Workbench - Deterministic Frontend Dev/Test Flows Against Virtualized Backends"
description: "Create an in-app scenario mocking and simulation workbench to model API states, RPC responses, failure modes, and time-based conditions for frontend development, QA, and demos"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Frontend development and QA depend on complex backend states (long campaigns, rare crashes, RPC faults, degraded integrations) that are hard to reproduce reliably:
- No unified UI to author mock scenarios for API/SSE/RPC responses and error conditions
- Demos and bug reproductions require brittle manual setup or shared environments
- Testing edge states (timeouts, partial data, permission denials, stale data) is inconsistent
- Mock data drifts from real schemas/contracts and breaks confidence

## Proposed Solution
Build a **Scenario Mocking & Simulation Workbench**:
- Scenario editor for endpoint/SSE/RPC mocks with rules, delays, faults, and state transitions
- Schema-aware mock generation and contract validation against OpenAPI/runtime types
- One-click scenario activation profiles for dev, e2e, demos, and bug reproduction
- Snapshot/record-replay from real responses (redacted) into reusable scenarios

## Requirements
### Functional
- [ ] Scenario model: endpoints, matchers, response templates, sequences, latency/fault injection, time controls
- [ ] Support REST, SSE streams, and RPC-like interactions used by the app (#002/#088)
- [ ] Schema-aware editors and validation against OpenAPI/TypeScript contracts (#032/#033)
- [ ] Record/redact from live traffic or fixtures to generate scenarios; diff scenario vs observed responses
- [ ] Scenario packs, versioning, sharing, and activation per workspace/session (#052/#071)
- [ ] Integration with e2e/dev tooling and visual/storybook contexts (#031/#028)
- [ ] UI indicators when mock mode is active and guardrails preventing accidental production use
- [ ] Permission/audit controls for recording sensitive data and sharing scenarios (#025/#063/#070)

### Non-Functional
- [ ] Deterministic scenario playback and reproducible timing controls
- [ ] Low overhead toggle/activation; no impact when disabled
- [ ] Secure redaction pipeline for captured payloads
- [ ] Developer-friendly diagnostics for unmatched requests and rule conflicts

## Files to Modify / Create
```
apps/web/src/features/mock-workbench/
├── ScenarioWorkbench.tsx
├── editors/
│   ├── EndpointRuleEditor.tsx
│   ├── StreamScenarioEditor.tsx
│   └── FaultInjectionPanel.tsx
├── recorder/
├── validator/
└── hooks/useMockScenarios.ts

apps/web/src/app/dev/mock-scenarios/page.tsx
apps/web/src/lib/mocks/scenario-runtime.ts
docs/frontend/api-scenario-mocking-workbench.md
```

## Acceptance Criteria
- Developers/QA can model and replay complex backend states deterministically
- Scenarios validate against schemas/contracts and are shareable/versioned
- Mock mode is explicit, safe, and useful for tests/demos/bug reproduction

## PR Guide
- Branch: `issue/105-frontend-api-scenario-mocking-workbench`
- Phase 1: scenario model/runtime + editor UI
- Phase 2: schema validation + recording/redaction
- Phase 3: packs/sharing + e2e/storybook integration
- Phase 4: safety guardrails, docs/tests

**Estimated effort:** 5-6 weeks (200 pts)
