---
name: "Frontend: Real-time Run Streaming with Server-Sent Events (SSE) & WebSocket Fallback"
description: "Replace polling-based run updates with persistent SSE connection, automatic WebSocket fallback, and optimistic UI for sub-second live updates"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current run updates use **short-polling** (5-15s intervals) via `apps/web/src/lib/run-stream.ts` and `apps/web/src/app/runs/`. This causes:

- **Stale data**: 5-15s delay seeing new crashes, status changes, metric updates
- **Thundering herd**: All clients poll simultaneously → API spikes
- **No backpressure**: Cannot handle 500+ concurrent dashboard users
- **Battery drain**: Mobile clients wake radio every poll interval
- **Missed events**: Rapid state transitions (queued → running → crashed) can be skipped

## Current Architecture

```
Client (polling)          API                        Core
    │                      │                           │
    ├── GET /runs?since=X ───▶                        │
    │◀─── 200 OK ──────────┤                           │
    │                      │                           │
    (wait 5-15s)           │                           │
    │                      │                           │
    ├── GET /runs?since=Y ───▶                        │
    │◀─── 200 OK ──────────┤                           │
```

## Proposed Solution

**Persistent SSE with WebSocket Upgrade Path**

```
Client (SSE)              API (Next.js)               Core (Redis Pub/Sub)
    │                      │                           │
    ├── GET /api/runs/stream ──────▶                   │
    │◀─── 200 OK (stream open) ────┤                   │
    │                      │                           │
    │                    ┌─▶ Redis: runs:events ───────┤
    │                    │   (pub/sub)                  │
    │                    │◀─ event: run.created ────────┤
    │                    │                              │
    │◀─── event: data ───┤                              │
    │                      │                              │
    │                    ┌─▶ Redis: runs:events ───────┤
    │                    │◀─ event: run.crashed ────────┤
    │◀─── event: data ───┤                              │
```

**Fallback Chain**: SSE → WebSocket (if proxy supports) → Long-polling (last resort)

## Requirements

### Functional

- [ ] Persistent SSE connection per tab (max 1 per origin via `EventSource` singleton)
- [ ] Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] Event types: `run.created`, `run.status_changed`, `run.metrics_updated`, `run.crashed`, `run.completed`, `artifact.uploaded`
- [ ] Optimistic UI: immediate local state update → server confirmation → rollback on conflict
- [ ] Per-campaign subscription (filter events by `campaignId` via query param)
- [ ] Connection health indicator in NavBar (green/yellow/red dot)
- [ ] Graceful degradation: fallback to 15s polling if SSE/WS fails 3x

### Non-Functional

- [ ] Support 1,000 concurrent connections per API instance (horizontal scaling via Redis)
- [ ] < 500ms end-to-end latency (core event → client render)
- [ ] Zero message loss (Redis stream with consumer groups for durability)
- [ ] Memory: < 2MB per connection on server
- [ ] Works behind corporate proxies (SSE over HTTP/1.1, WS over HTTP/2)
- [ ] Auth: JWT in `Authorization` header + `EventSource` `withCredentials`

## Files to Modify / Create

```
apps/web/src/lib/streaming/
├── RunEventStream.ts                 # SSE client with fallback chain
├── RunEventStream.test.ts
├── useRunStream.ts                   # React hook for components
├── useRunStream.test.ts
├── connectionManager.ts              # Singleton connection + health
├── eventTypes.ts                     # Zod schemas for each event
├── optimisticUpdater.ts              # Optimistic UI state machine
└── fallback/
    ├── WebSocketTransport.ts
    ├── LongPollTransport.ts
    └── transportFactory.ts

apps/web/src/app/api/runs/stream/
├── route.ts                          # SSE endpoint (Next.js)
├── route.test.ts
├── redisSubscriber.ts                # Redis Pub/Sub consumer
└── auth.ts                           # JWT validation for SSE
```

## Acceptance Criteria

| Scenario | Target | Test Method |
|----------|--------|-------------|
| New run appears on dashboard | < 500ms | E2E: create run → assert DOM update |
| Status change (running→crashed) | < 300ms | E2E: trigger crash → assert badge |
| 1000 concurrent connections | Stable | Load test: `k6` script |
| Reconnection after network loss | < 5s | Chaos: `tc qdisc add netem loss 50%` |
| Memory per connection (server) | < 2MB | `pm2 monit` / heap snapshot |
| Fallback chain activation | < 10s total | Simulate proxy blocking SSE |

## PR Guide

- Branch: `issue/002-realtime-run-streaming-sse`
- Phase 1: SSE client + hook + types (no backend)
- Phase 2: Next.js SSE endpoint + Redis Pub/Sub
- Phase 3: Fallback chain + health indicator
- Phase 4: Optimistic UI integration
- Update `docs/ARCHITECTURE.md` with streaming architecture
- Add `k6` load test script to `scripts/load-test/`

## Related Issues

- Depends on: #001 (virtualized table needs live data)
- Blocks: #003 (cross-run board real-time), #015 (collaborative triage)
- Related: #008 (notification center real-time)

## Contributor Notes

**Start here if:** You have experience with:
- Server-Sent Events (EventSource API) and WebSocket
- Redis Pub/Sub / Streams for horizontal scaling
- Next.js API routes with streaming responses
- Optimistic UI patterns (React Query, SWR, or custom)

**Key challenges:**
- `EventSource` doesn't support custom headers → auth via cookie or query param token
- Connection pooling in serverless (Vercel) requires external Redis
- Safari `EventSource` reconnection bugs — need polyfill

**Learning resources:**
- SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Next.js streaming: https://nextjs.org/docs/app/api-reference/file-conventions/route/streaming
- Redis Streams: https://redis.io/docs/latest/develop/data-types/streams/

**Estimated effort:** 3-4 weeks
**Mentorship available:** Yes — backend streaming expert available for pairing