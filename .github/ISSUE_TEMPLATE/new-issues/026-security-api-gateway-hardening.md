---
name: "Security: API Gateway Hardening - Rate Limiting Tiers, DDoS Protection, Request Validation & Abuse Detection"
description: "Harden the API layer with tiered rate limiting, adaptive throttling, request schema validation, abuse pattern detection, and IP reputation integration"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

API endpoints lack robust protection against abuse:
- Basic/fixed rate limiting insufficient for multi-tenant workloads
- No adaptive throttling under load
- Inconsistent request validation across routes
- No abuse pattern detection (credential stuffing, scraping, enumeration)
- No per-tenant/per-key quotas with burst handling

## Proposed Solution

**API Gateway Hardening Layer** with adaptive protection:

- **Tiered Rate Limiting**: Per-IP, per-user, per-API-key, per-tenant with burst + sustained quotas
- **Adaptive Throttling**: Dynamic limits based on system load and endpoint cost
- **Schema Validation**: Centralized Zod/OpenAPI-driven request validation for all routes
- **Abuse Detection**: Pattern detection for enumeration, brute force, scraping, anomalous traffic
- **IP Reputation**: Integration with threat intel feeds and automatic challenge/block workflows

## Requirements

### Functional
- [ ] Tiered rate limiter (Redis-backed) with configurable policies per endpoint group
- [ ] Adaptive throttling based on queue depth, latency, and error rates
- [ ] Centralized request validation middleware with consistent error responses
- [ ] Abuse detection engine (sliding windows, anomaly scoring, fingerprinting)
- [ ] IP reputation integration and automated challenge/block/escalate actions
- [ ] Per-tenant quota management with usage dashboard
- [ ] Standardized 429 responses with Retry-After and quota headers

### Non-Functional
- [ ] Rate limit check latency < 2ms p99
- [ ] Accurate counting under distributed load
- [ ] Graceful degradation if Redis unavailable (configurable fail-open/closed)
- [ ] No false positives > 0.1% for legitimate traffic

## Files to Modify / Create
```
apps/web/src/lib/security/api-gateway/
├── RateLimitEngine.ts
├── TieredLimiter.ts
├── AdaptiveThrottler.ts
├── QuotaManager.ts
├── RequestValidator.ts
├── AbuseDetector.ts
├── IPReputation.ts
├── Middleware.ts
└── policies.ts

apps/web/src/middleware.ts (enhance)
apps/web/src/app/api/admin/quotas/route.ts
apps/web/src/app/api/admin/abuse/route.ts

tests/security/
├── rate-limit.test.ts
├── abuse-detection.test.ts
└── adaptive-throttle.test.ts
```

## Acceptance Criteria
- All API routes protected by centralized rate limiting and validation
- Abuse patterns detected and mitigated in simulation tests
- Per-tenant quotas enforced with correct headers
- Adaptive throttling activates under load test

## PR Guide
- Branch: `issue/026-security-api-gateway-hardening`
- Phase 1: Tiered rate limiting + quotas
- Phase 2: Request validation middleware
- Phase 3: Abuse detection + IP reputation
- Phase 4: Dashboard + adaptive throttling

**Estimated effort:** 4-5 weeks