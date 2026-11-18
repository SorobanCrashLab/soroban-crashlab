---
name: "Frontend: Golden Reproducers & Fixtures Manager - Curation, Validation, Versioning, and Promotion Workflows"
description: "Implement a frontend system to curate, validate, version, and promote golden reproducers and fixtures with provenance, determinism checks, and integration into triage/regression pipelines"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Reliable reproducers and fixtures are the backbone of regression prevention, but they are difficult to manage at scale:
- Reproducers are scattered across runs/artifacts with unclear quality and freshness
- No UI to validate determinism, environment compatibility, or replay success over time
- Promoting a run-derived reproducer to a "golden" fixture lacks governance and provenance
- Fixture sets are hard to browse, diff, tag, and map to crashes/tests/campaigns
- Teams cannot easily detect flaky or stale reproducers and retire/replace them

## Proposed Solution
Create a **Golden Reproducers & Fixtures Manager**:
- Catalog of candidate and golden reproducers/fixtures with rich metadata and provenance
- Validation workflows (replay, determinism checks, environment matrix) and status badges
- Promotion/demotion lifecycle with approvals, versioning, and changelog
- Diffing and dependency views (inputs, contracts, artifacts, related crashes/tests)
- Integration with triage, regression suites, and CI artifact publishing

## Requirements
### Functional
- [ ] Import candidates from runs/crashes/artifacts; dedupe and link to signatures/clusters (#021/#061)
- [ ] Metadata: origin run, commit/env fingerprint, contract(s), seed/call sequence, expected outcome
- [ ] Validation actions: replay once/multi-run determinism, compatibility matrix, last-known-good tracking
- [ ] Promotion workflow: draft → validated → golden → deprecated with approvals and rationale (#063/#070)
- [ ] Version history, diff between fixture/reproducer revisions, and rollback support
- [ ] Tagging/search/filtering by contract, failure class, severity, owner, and suite membership
- [ ] Export/publish fixtures to repos/CI bundles and link to regression test results (#043/#093)
- [ ] Notifications for validation failures, stale fixtures, or breaking environment changes (#041/#049)

### Non-Functional
- [ ] Deterministic provenance records and immutable audit trail for promotions
- [ ] Scales to thousands of fixtures with indexed search and pagination
- [ ] Safe handling of executable repro artifacts (sandboxed previews, no implicit execution)
- [ ] Accessible management UI and clear status semantics

## Files to Modify / Create
```
apps/web/src/features/reproducers/
├── ReproducerManager.tsx
├── ReproducerDetail.tsx
├── ValidationRunsPanel.tsx
├── PromotionWorkflow.tsx
├── FixtureDiffView.tsx
└── hooks/useReproducers.ts

apps/web/src/app/reproducers/page.tsx
apps/web/src/app/api/reproducers/route.ts
apps/web/src/app/api/reproducers/[id]/validate/route.ts
apps/web/src/app/api/reproducers/[id]/promote/route.ts
apps/web/src/lib/reproducers/
├── provenance.ts
├── validation.ts
└── versioning.ts
docs/frontend/golden-reproducers-fixtures.md
```

## Acceptance Criteria
- Teams can curate and promote reliable reproducers/fixtures with confidence and traceability
- Determinism/compatibility status is visible and kept current
- Regression suites and triage workflows can consume managed fixtures directly
- Governance, audit, and safety requirements enforced

## PR Guide
- Branch: `issue/079-frontend-golden-reproducers-fixtures-manager`
- Phase 1: catalog/import/provenance model
- Phase 2: validation workflows + status tracking
- Phase 3: promotion/versioning/diff/export integrations
- Phase 4: governance hardening, notifications, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
