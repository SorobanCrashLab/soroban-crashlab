---
name: "Integration: Webhook Delivery Reliability - Guaranteed Exactly-Once Delivery with Dead Letter Queue, Retry Policies & Observability"
description: "Overhaul webhook delivery system with exactly-once semantics, configurable retry policies per endpoint, dead letter queue with replay UI, and comprehensive delivery observability"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current webhook system (`apps/web/src/lib/webhook-delivery-worker.ts`, `webhook-retry-queue.ts`, `webhook-dlq.ts`) has gaps:
- At-least-once only (duplicates possible)
- Fixed retry policy (no per-endpoint customization)
- DLQ exists but no replay UI / bulk replay
- Limited observability (no delivery latency percentiles, no endpoint health scoring)
- No circuit breaker for failing endpoints
- No webhook signing verification on receiver side (documentation only)

## Current State

- `webhook-delivery-worker.ts` — Worker process
- `webhook-retry-queue.ts` — Retry logic (exponential backoff)
- `webhook-dlq.ts` — Dead letter queue
- `webhook-store.ts` — Persistence
- `webhook-hmac.ts` — Signing
- `apps/web/src/app/api/webhooks/` — CRUD endpoints

## Proposed Solution

**Enterprise-Grade Webhook Delivery Platform** with exactly-once, observability, and self-service:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Webhooks                                    [+ New Endpoint]                │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Endpoint                    │ Status │ Success │ Latency │ Last 24h   │ │
│  │  https://api.acme.com/hook   │ 🟢     │ 99.97%  │ p50:45ms│ 12,450 ✓  │ │
│  │  https://slack.com/webhook   │ 🟡     │ 98.2%   │ p50:230ms│ 890 ✓ 12 ✗ │ │
│  │  https://pagerduty.com/hook  │ 🔴     │ 45.1%   │ p50:5.2s │ 34 ✓ 41 ✗  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Delivery Timeline (selected endpoint)                                  │ │
│  │  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │ │
│  │  ✓✓✓✓✓✓✓✗✗✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓   │ │
│  │  [Retry Policy: Exponential 1s,2s,4s,8s,16s,32s | Max 6 | Timeout 30s] │ │
│  │  [Circuit Breaker: 5 failures → open 60s | Half-open 3 requests]       │ │
│  │  [DLQ: 12 messages | Replay All | Replay Selected | Purge]             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Exactly-once delivery**: Idempotency keys (SHA256 of payload + endpoint) + receiver acknowledgment tracking
- [ ] **Per-endpoint retry policy**: Custom backoff (exponential, linear, fixed), max attempts, timeout, retryable status codes
- [ ] **Circuit breaker**: Configurable failure threshold → open → half-open → closed; per-endpoint
- [ ] **Dead Letter Queue UI**: Browse, filter, inspect payload/headers, retry single/bulk, purge
- [ ] **Delivery observability**: Latency percentiles (p50, p95, p99), success rate, error categorization, endpoint health score
- [ ] **Webhook signing**: HMAC-SHA256 with rotating keys; verification helper for receivers
- [ ] **Transform middleware**: Optional payload transformation (JQ/JSONata) before delivery
- [ ] **Batch delivery**: Combine multiple events into single payload (configurable window/count)
- [ ] **Self-service**: Teams manage own endpoints, policies, view metrics (RBAC integrated)

### Non-Functional

- [ ] Delivery latency (p99) < 5s for healthy endpoints
- [ ] 10,000 deliveries/sec per worker (horizontal scaling via Redis streams)
- [ ] Exactly-once guarantee: 0 duplicates in 1M deliveries (tested)
- [ ] DLQ replay: 1000 messages < 30s
- [ ] Bundle size: Worker < 50KB (no UI)
- [ ] HA: Multi-worker coordination via Redis locks

## Files to Modify / Create

```
apps/web/src/lib/webhooks/
├── delivery/
│   ├── WebhookDeliveryEngine.ts        # Core delivery orchestration
│   ├── IdempotencyManager.ts           # Exactly-once keys + receiver ack
│   ├── RetryPolicyEngine.ts            # Per-endpoint policy evaluation
│   ├── CircuitBreaker.ts               # State machine + Redis coordination
│   ├── BatchAggregator.ts              # Event batching
│   └── TransformMiddleware.ts          # JQ/JSONata transforms
├── dlq/
│   ├── DeadLetterQueue.ts              # Core DLQ operations
│   ├── DLQReplayEngine.ts              # Single/bulk replay
│   ├── DLQApi.ts                       # REST API for UI
│   └── DLQMonitor.ts                   # Alerts on DLQ growth
├── observability/
│   ├── DeliveryMetricsCollector.ts     # Latency, success, errors
│   ├── EndpointHealthScorer.ts         # Composite health score
│   ├── MetricsExporter.ts              # Prometheus / Datadog
│   └── DeliveryTracer.ts               # Distributed tracing (W3C)
├── signing/
│   ├── KeyRotationManager.ts           # Rotating HMAC keys
│   ├── SignatureVerifier.ts            # Receiver-side helper (npm pkg)
│   └── SigningMiddleware.ts            # Auto-sign outbound
└── worker/
    ├── DeliveryWorker.ts               # Main worker (refactored)
    ├── WorkerCoordinator.ts            # Redis-based leader election
    └── WorkerHealth.ts                 # Self-reporting
```

**UI** (new):
```
apps/web/src/app/integrations/webhooks/
├── WebhooksDashboard.tsx               # Main dashboard
├── EndpointDetail.tsx                  # Per-endpoint metrics + config
├── DLQBrowser.tsx                      # DLQ UI
├── RetryPolicyEditor.tsx               # Visual policy builder
└── CircuitBreakerStatus.tsx            # Real-time state
```

**API** (enhance):
```
apps/web/src/app/api/webhooks/
├── endpoints/route.ts                  # CRUD + policy config
├── deliveries/route.ts                 # Query delivery history
├── dlq/route.ts                        # DLQ CRUD + replay
├── metrics/route.ts                    # Aggregated metrics
└── signing/route.ts                    # Key management
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Exactly-once (1M deliveries) | 0 duplicates | Chaos test |
| Retry policy custom | Applied correctly | Unit + Integration |
| Circuit breaker trip | < 100ms | Load test |
| DLQ replay 1000 msgs | < 30s | Benchmark |
| p99 latency | < 5s | Production monitor |
| Health score accuracy | Matches manual | Validation |

## PR Guide

- Branch: `issue/011-webhook-delivery-reliability`
- Phase 1: Exactly-once + idempotency + retry policies
- Phase 2: Circuit breaker + DLQ replay engine
- Phase 3: Observability + metrics + health scoring
- Phase 4: UI dashboard + signing + transforms
- **Dependencies**: `jsonata` (transforms), `jq-web` (optional), Prometheus client
- Update `docs/ARCHITECTURE.md` with webhook delivery architecture
- Update `docs/WEBHOOKS.md` with new features

## Related Issues

- Depends on: #002 (SSE for real-time dashboard updates)
- Blocks: #018 (scheduled webhook health alerts)
- Related: `webhook-delivery-worker.ts`, `webhook-retry-queue.ts`, `webhook-dlq.ts` (refactor)

## Contributor Notes

**Start here if:** You have experience with:
- Distributed message delivery (Kafka, RabbitMQ, Redis Streams patterns)
- Exactly-once semantics and idempotency
- Circuit breaker patterns (Hystrix, Resilience4j)
- Observability (Prometheus, OpenTelemetry)

**Key challenges:**
- Exactly-once: Receiver must acknowledge; handle receiver crashes
- Circuit breaker: Distributed state via Redis, avoid split-brain
- DLQ replay: Replay must respect original retry policy or new?
- Metrics cardinality: Per-endpoint + per-event-type → high cardinality

**Learning resources:**
- Redis Streams: https://redis.io/docs/latest/develop/data-types/streams/
- Circuit breaker: https://martinfowler.com/bliki/CircuitBreaker.html
- Webhook best practices: https://webhooks.fyi/

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes