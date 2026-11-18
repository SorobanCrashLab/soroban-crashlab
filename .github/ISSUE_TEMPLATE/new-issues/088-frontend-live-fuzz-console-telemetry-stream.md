---
name: "Frontend: Live Fuzz Console & Telemetry Stream - Real-Time Execution Feed, Controls, and Health Signals"
description: "Build a real-time fuzzing console that streams execution telemetry, worker health, findings, and resource signals with interactive controls, filters, and incident-aware overlays"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
During active campaigns, operators need immediate feedback and control. Existing dashboards lack a unified live console:
- No real-time, filterable feed of executions, crashes, anomalies, and worker events
- Hard to correlate telemetry spikes with config changes, queue states, or environment issues
- Limited operator controls (pause/throttle/drain/quarantine target) from a single view
- High-volume streams can overwhelm UI without backpressure-aware rendering

## Proposed Solution
Implement a **Live Fuzz Console**:
- Streaming event/log/metric feed with structured filters and pinned signals
- Worker/queue/target health panels and rate/latency/budget gauges
- Safe operator controls with confirmations and audit logging
- Replay/time-window mode to inspect recent bursts and correlate with traces/incidents

## Requirements
### Functional
- [ ] Real-time stream (SSE/WebSocket compatible) of executions, findings, errors, and worker events (#002)
- [ ] Console filters/search, severity lanes, pause/resume stream, and pinned watches (#075 patterns)
- [ ] Health widgets: throughput, crash rate, queue depth, worker status, budget exhaustion, RPC/host errors
- [ ] Operator actions: pause/resume/throttle campaign, drain workers, quarantine target/seed source (#070/#063)
- [ ] Burst detection overlays and jump-to-incident/run/trace correlation (#066/#068)
- [ ] Time-window replay buffer and export of console slices
- [ ] Workspace-scoped views and shareable live-view links (#071/#056)

### Non-Functional
- [ ] Backpressure-aware rendering (windowing, sampling indicators) for high event rates
- [ ] <1s perceived update latency under normal load; graceful degradation on disconnect
- [ ] No lost critical control acknowledgments; idempotent command UX
- [ ] Accessible live-region announcements and keyboard-operable controls

## Files to Modify / Create
```
apps/web/src/features/console/
├── LiveFuzzConsole.tsx
├── TelemetryStream.tsx
├── HealthPanels.tsx
├── OperatorControls.tsx
├── BurstTimeline.tsx
└── hooks/useLiveConsole.ts

apps/web/src/app/console/page.tsx
apps/web/src/app/api/console/stream/route.ts
apps/web/src/app/api/console/controls/route.ts
docs/frontend/live-fuzz-console.md
```

## Acceptance Criteria
- Operators can monitor and control active fuzzing from a unified real-time console
- High-volume telemetry remains usable and responsive
- Controls are safe, audited, and permission-aware
- Correlations to runs/incidents/traces work reliably

## PR Guide
- Branch: `issue/088-frontend-live-fuzz-console`
- Phase 1: streaming feed + health panels
- Phase 2: filters/watches + controls/audit
- Phase 3: replay buffer + correlations/links
- Phase 4: resilience, a11y, load tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
