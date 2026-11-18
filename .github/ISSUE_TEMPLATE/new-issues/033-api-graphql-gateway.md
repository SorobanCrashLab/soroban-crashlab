---
name: "API: GraphQL Gateway - Unified Data API with Subscriptions, Batching, Caching & Type-Safe Client"
description: "Implement a GraphQL gateway layer providing unified data access, real-time subscriptions, request batching, field-level caching, and type-safe client generation"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current REST API has limitations for complex frontend needs:
- Over-fetching/under-fetching (multiple requests for dashboard views)
- No real-time subscriptions (separate SSE implementation)
- No request batching/deduplication at API level
- Manual type definitions drift from API responses
- Complex nested data requires multiple round trips

## Proposed Solution

**GraphQL Gateway** alongside existing REST:

- **Schema-First Design**: Unified schema covering runs, campaigns, crashes, analytics, integrations
- **Subscriptions**: Real-time updates via GraphQL subscriptions (WebSocket/SSE transport)
- **DataLoader**: Batching and caching for N+1 prevention
- **Code Generation**: Type-safe client hooks from schema (`graphql-codegen`)
- **Federation-Ready**: Modular schema for future service decomposition

## Requirements

### Functional
- [ ] GraphQL schema covering: runs, campaigns, crashes, artifacts, analytics, integrations, users
- [ ] Queries with filtering, pagination (cursor-based), sorting, field selection
- [ ] Mutations for triage actions, campaign management, settings
- [ ] Subscriptions for run updates, crash events, campaign metrics (SSE transport)
- [ ] DataLoader integration for efficient data fetching
- [ ] Field-level caching with TTL and invalidation
- [ ] Type-safe client generation (React hooks via graphql-codegen + urql/apollo)
- [ ] GraphQL playground/explorer in dev mode

### Non-Functional
- [ ] Query complexity limits and depth limiting
- [ ] p95 query latency < 200ms for typical dashboard queries
- [ ] Subscription delivery < 500ms
- [ ] Backward compatible: REST API remains functional

## Files to Modify / Create
```
apps/web/src/graphql/
├── schema/
│   ├── index.ts
│   ├── runs.graphql
│   ├── campaigns.graphql
│   ├── crashes.graphql
│   ├── analytics.graphql
│   ├── integrations.graphql
│   └── subscriptions.graphql
├── resolvers/
│   ├── runs.ts
│   ├── campaigns.ts
│   ├── crashes.ts
│   ├── analytics.ts
│   └── subscriptions.ts
├── dataloaders/
│   ├── RunLoader.ts
│   ├── CampaignLoader.ts
│   └── CrashLoader.ts
├── server.ts
├── context.ts
└── codegen.ts

apps/web/src/app/api/graphql/route.ts
apps/web/src/lib/graphql-client/
├── client.ts
├── generated/ (codegen output)
└── hooks.ts
```

## Acceptance Criteria
- Schema covers all major data types
- Subscriptions deliver real-time updates
- DataLoader prevents N+1 queries
- Type-safe client hooks generated and usable
- Query complexity/depth limits enforced

## PR Guide
- Branch: `issue/033-api-graphql-gateway`
- Phase 1: Schema + resolvers + queries
- Phase 2: Mutations + DataLoader + caching
- Phase 3: Subscriptions + real-time
- Phase 4: Client codegen + integration

**Estimated effort:** 5-6 weeks