---
name: "API: Event-Driven Architecture - Domain Events, Event Sourcing for Runs, CQRS Read Models & Event Replay"
description: "Implement event-driven architecture with domain events, event sourcing for run lifecycle, CQRS read models for analytics, and event replay capabilities for debugging and recovery"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current architecture is request-response only:
- No domain event model (run state changes are implicit)
- Analytics queries scan raw data (slow, not optimized)
- No event replay for debugging or recovery
- Tight coupling between write operations and read views
- Difficult to add new consumers (notifications, analytics, integrations) without modifying core logic

## Proposed Solution

**Event-Driven Architecture** with CQRS:

- **Domain Events**: Typed events for all significant state changes (RunCreated, CrashDetected, TriageCompleted, etc.)
- **Event Store**: Append-only event log with ordering guarantees
- **CQRS Read Models**: Optimized projections for dashboard, analytics, search
- **Event Replay**: Replay events to rebuild read models, debug issues, backfill data
- **Event Bus**: Pub/sub for internal consumers (notifications, analytics, integrations)

## Requirements

### Functional
- [ ] Domain event catalog with Zod schemas (50+ event types covering full lifecycle)
- [ ] Event store with append-only semantics, ordering, and idempotency
- [ ] CQRS read models: dashboard summary, run list projections, analytics aggregates, search index
- [ ] Event bus with typed publishers/subscribers and dead letter handling
- [ ] Event replay capability: rebuild any read model from event stream
- [ ] Event versioning and schema evolution strategy
- [ ] Integration: webhooks (#011), notifications, analytics consume domain events

### Non-Functional
- [ ] Event publish latency < 10ms
- [ ] Read model eventual consistency < 1s
- [ ] Event replay: 1M events in < 5min
- [ ] Event store retention: configurable (default 1 year)

## Files to Modify / Create
```
apps/web/src/lib/events/
├── EventStore.ts
├── EventBus.ts
├── DomainEvents.ts
├── EventSchemas.ts
├── EventVersioning.ts
├── publishers/
│   ├── RunEventPublisher.ts
│   ├── CampaignEventPublisher.ts
│   └── TriageEventPublisher.ts
├── subscribers/
│   ├── NotificationSubscriber.ts
│   ├── AnalyticsSubscriber.ts
│   ├── WebhookSubscriber.ts
│   └── SearchIndexSubscriber.ts
├── projections/
│   ├── DashboardProjection.ts
│   ├── RunListProjection.ts
│   ├── AnalyticsProjection.ts
│   └── ProjectionManager.ts
├── replay/
│   ├── EventReplayer.ts
│   └── ProjectionRebuilder.ts
└── types.ts

apps/web/src/app/api/events/
├── stream/route.ts
├── replay/route.ts
└── projections/route.ts
```

## Acceptance Criteria
- All major state changes emit domain events
- Read models rebuild correctly from event replay
- Event consumers (webhooks, notifications) driven by event bus
- Event versioning handles schema evolution

## PR Guide
- Branch: `issue/034-api-event-driven-architecture`
- Phase 1: Event store + domain events + bus
- Phase 2: Publishers + subscribers integration
- Phase 3: CQRS read models + projections
- Phase 4: Event replay + versioning

**Estimated effort:** 5-6 weeks