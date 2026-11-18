---
name: "Frontend: Contract Call Builder & ABI-Aware Invocation Composer - Typed Inputs, Simulation Preview, and Scenario Templates"
description: "Deliver an ABI-aware contract invocation composer UI for building, validating, simulating, and saving Soroban call sequences with typed inputs, auth/resource previews, and reusable templates"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Creating and iterating on contract invocations for fuzzing, replay, and debugging is error-prone when users must handcraft payloads and sequences:
- No UI to compose typed calls from contract specs/ABIs with validation
- Difficult to model multi-call sequences, dependencies, and environment/auth context
- No preflight simulation preview for expected resources, auth requirements, or likely failures
- Reuse of invocation scenarios across campaigns/runs is manual
- Poor linkage between invocation definitions, observed runs, and reproducer artifacts

## Proposed Solution
Build a **Contract Call Builder & Invocation Composer**:
- ABI/spec-driven call editor with typed form inputs and XDR payload preview (#073)
- Sequence composer for ordered multi-invocation scenarios with variable passing and fixtures
- Preflight/simulation panel (where available) showing validation, auth/resource estimates, and warnings
- Scenario templates, versioning, and parameter presets for campaigns and debugging
- Direct actions: run now, attach to campaign, export as reproducer/fixture

## Requirements
### Functional
- [ ] Import/resolve contract interfaces (WASM/spec metadata, known registry, or uploaded artifacts)
- [ ] Typed editors for function args, structs/enums/maps/vecs, addresses, and bytes with validation
- [ ] Multi-call sequence builder: ordering, dependencies, conditional steps, and environment overrides
- [ ] Auth/resource/network context configuration (invoker, signers, footprint hints, budgets) with safe defaults
- [ ] Preflight validation and simulation preview with decoded results/events/errors
- [ ] Save/load/version scenario templates; share links and workspace-scoped libraries (#052/#071)
- [ ] Export to reproducer scripts, campaign seed inputs, and API payloads; import from runs/traces
- [ ] Permission-aware execution controls and audit logging for run-triggering actions (#070/#063)

### Non-Functional
- [ ] Responsive editing for large schemas/sequences (virtualized lists, debounced validation)
- [ ] Deterministic serialization of scenarios for diffing and version control
- [ ] Clear error mapping from validation/simulation failures to fields/steps
- [ ] Accessible forms, keyboard workflows, and screen-reader friendly schema navigation

## Files to Modify / Create
```
apps/web/src/features/invocation-composer/
├── InvocationComposer.tsx
├── ContractSelector.tsx
├── FunctionCallEditor.tsx
├── SequenceBuilder.tsx
├── SimulationPreview.tsx
├── templates/ScenarioTemplates.tsx
└── hooks/useInvocationComposer.ts

apps/web/src/app/contracts/compose/page.tsx
apps/web/src/app/api/contracts/spec/route.ts
apps/web/src/app/api/invocations/simulate/route.ts
apps/web/src/lib/invocations/
├── schema.ts
├── serialize.ts
└── exporters.ts
docs/frontend/contract-call-builder.md
```

## Acceptance Criteria
- Users can compose valid single/multi-call invocations from ABI-aware UI without manual XDR crafting
- Simulation/validation feedback prevents common errors before execution
- Scenarios are reusable, versioned, exportable, and linked to runs/campaigns
- Execution and sharing respect permissions and workspace boundaries

## PR Guide
- Branch: `issue/074-frontend-contract-call-builder`
- Phase 1: schema resolution + typed call editor + serialization
- Phase 2: sequence builder + templates + persistence
- Phase 3: simulation preview + run/export integrations
- Phase 4: a11y, performance, audit/permissions, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
