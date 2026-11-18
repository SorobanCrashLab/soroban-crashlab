---
name: "Testing: Contract Testing & API Mocking Infrastructure - Provider/Consumer Contracts, MSW Integration & Schema Validation"
description: "Implement contract testing between frontend and API with schema-driven mocks, MSW handlers, OpenAPI validation, and consumer-driven contract verification"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Frontend-backend integration is fragile:
- API changes break frontend without early detection
- Manual mocks drift from actual API behavior
- No contract verification between API producers and consumers
- OpenAPI spec may not match actual implementation
- Integration tests require running backend (slow, flaky)

## Proposed Solution

**Contract Testing Infrastructure**:

- **MSW Handler Library**: Type-safe mock handlers generated from OpenAPI/schemas
- **Consumer-Driven Contracts**: Frontend declares expectations, verified against API
- **Schema Validation**: Runtime validation of API responses against Zod/OpenAPI schemas
- **Mock Server**: Standalone mock server for frontend development without backend
- **Contract CI**: Automated contract verification on PRs (both sides)

## Requirements

### Functional
- [ ] MSW handlers auto-generated from OpenAPI spec / Zod schemas
- [ ] Type-safe mock data factories with realistic data generation
- [ ] Consumer contract definitions for all frontend API usage
- [ ] Provider verification: API responses validated against contracts in CI
- [ ] Mock server mode: `pnpm dev:mock` runs frontend with full mock API
- [ ] Schema drift detection: Alert when API response doesn't match schema
- [ ] Contract versioning: Track breaking changes across releases

### Non-Functional
- [ ] Mock server startup < 3s
- [ ] Contract verification < 2min in CI
- [ ] 100% API endpoint coverage in mock handlers
- [ ] Zero schema drift in main branch

## Files to Modify / Create
```
apps/web/src/mocks/
├── handlers/ (generated + custom)
│   ├── runs.ts
│   ├── campaigns.ts
│   ├── integrations.ts
│   ├── webhooks.ts
│   └── index.ts
├── factories/
│   ├── run.factory.ts
│   ├── campaign.factory.ts
│   ├── crash.factory.ts
│   └── index.ts
├── server.ts
├── browser.ts
└── mock-server.ts

apps/web/src/contracts/
├── consumer/
│   ├── runs.contract.ts
│   ├── campaigns.contract.ts
│   └── index.ts
├── provider/
│   ├── verify.ts
│   └── schema-validator.ts
└── drift-detector.ts

scripts/
├── generate-mock-handlers.mjs
├── verify-contracts.mjs
└── detect-schema-drift.mjs

.github/workflows/contract-tests.yml
```

## Acceptance Criteria
- MSW handlers cover all API endpoints
- Mock server enables full frontend development without backend
- Contract verification catches breaking API changes in CI
- Schema drift detection alerts on mismatches

## PR Guide
- Branch: `issue/032-testing-contract-testing`
- Phase 1: MSW setup + handler generation + factories
- Phase 2: Consumer contracts + provider verification
- Phase 3: Mock server + schema drift detection
- Phase 4: CI integration + documentation

**Estimated effort:** 4-5 weeks