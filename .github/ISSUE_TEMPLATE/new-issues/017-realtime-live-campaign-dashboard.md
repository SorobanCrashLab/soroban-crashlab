---
name: "Real-time: Live Campaign Dashboard - Real-time Metrics, Auto-refreshing Visualizations & Alert Thresholds"
description: "Build a live campaign dashboard with WebSocket/SSE real-time metrics, auto-refreshing charts, configurable alert thresholds, and kiosk mode for monitoring screens"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current campaign monitoring requires manual refresh. Need:
- Real-time metrics (runs/sec, crash rate, queue depth, resource usage)
- Auto-refreshing visualizations (no user action)
- Alert thresholds with visual indicators
- Kiosk mode for wall-mounted displays
- Multi-campaign overview with drill-down

## Current State

- `apps/web/src/app/campaigns/` — Static pages
- `apps/web/src/features/analytics/` — Charts but not real-time
- No SSE/WebSocket for live metrics, no kiosk mode

## Proposed Solution

**Live Campaign Dashboard** with real-time data streaming:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Live Campaigns                                    [🖥️ Kiosk] [⚙️ Config]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  GLOBAL METRICS                              │  ALERTS (3)              │ │
│  │  Runs/sec: 47.3  ████████░░                 │  🔴 mainnet-fuzz         │ │
│  │  Crash rate: 2.1%  ██░░░░░░░░░░             │     Crash rate > 5%      │ │
│  │  Queue depth: 1,234  ███████░░░             │  🟡 testnet-regression   │ │
│  │  Workers: 47/50  ████████████               │     Queue > 1000         │ │
│  │  CPU: 78%  ██████████░░                     │  🟢 staging-daily        │ │
│  │  Memory: 62%  ████████░░                    │     All clear            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  CAMPAIGNS                                        [Auto-refresh: 2s]   │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  mainnet-fuzz                    🔴 CRITICAL                     │  │ │
│  │  │  ████████████░░░░░░░░░░  Runs: 12,450/50,000 (25%)               │  │ │
│  │  │  Crashes: 287 (2.3%)  │  Gas avg: 847K  │  Queue: 1,234         │  │ │
│  │  │  [▶ Pause] [⏭ Skip] [🔍 Drill] [⚠️ Alert Config]                │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  testnet-regression              🟡 WARNING                       │  │ │
│  │  │  ████████████████████  Runs: 45,000/50,000 (90%)                 │  │ │
│  │  │  Crashes: 12 (0.03%) │  Gas avg: 423K │  Queue: 56              │  │ │
│  │  │  [▶ Pause] [⏭ Skip] [🔍 Drill] [⚠️ Alert Config]                │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  staging-daily                   🟢 HEALTHY                       │  │ │
│  │  │  ████████████████████  Runs: 5,000/5,000 (100%) ✓               │  │ │
│  │  │  Crashes: 0  │  Gas avg: 312K  │  Queue: 0                       │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Real-time Metrics**: SSE (#002) → runs/sec, crash rate, queue, workers, resources
- [ ] **Auto-refreshing Charts**: Line/area charts update smoothly (no flicker)
- [ ] **Alert Thresholds**: Per-campaign rules (crash rate, queue depth, run duration, resource %)
- [ ] **Visual Alert States**: 🟢 Healthy, 🟡 Warning, 🔴 Critical (configurable thresholds)
- [ ] **Kiosk Mode**: Full-screen, auto-rotate campaigns, hide UI chrome, screensaver prevention
- [ ] **Multi-campaign Overview**: Grid/list with sortable columns
- [ ] **Drill-down**: Click campaign → live run list + real-time run details
- [ ] **Configuration UI**: Alert rules, refresh interval, displayed metrics, kiosk settings
- [ ] **Webhook on Alert**: Trigger #011 webhooks when threshold crossed

### Non-Functional

- [ ] Update latency < 500ms (SSE → chart)
- [ ] 60fps chart animations (Canvas/WebGL via Chart.js or uPlot)
- [ ] Kiosk mode: Runs 24/7 without memory leaks
- [ ] Support 50+ campaigns simultaneously
- [ ] Bundle: Dashboard < 100KB (charts lazy-loaded)

## Files to Modify / Create

```
apps/web/src/features/analytics/live-dashboard/
├── LiveCampaignDashboard.tsx           # Main dashboard
├── LiveCampaignDashboard.test.tsx
├── metrics/
│   ├── MetricStream.ts                 # SSE subscription + parsing
│   ├── MetricAggregator.ts             # Rolling windows, rates
│   ├── AlertEngine.ts                  # Threshold evaluation
│   └── useLiveMetrics.ts
├── charts/
│   ├── LiveChart.tsx                   # uPlot/Chart.js wrapper
│   ├── MetricSparkline.tsx             # Mini charts in cards
│   ├── GlobalMetricsPanel.tsx          # Top metrics row
│   └── ChartTheme.ts                   # Dark/light, kiosk high-contrast
├── campaigns/
│   ├── CampaignCard.tsx                # Single campaign with alerts
│   ├── CampaignGrid.tsx                # Responsive grid
│   ├── CampaignDrilldown.tsx           # Live run list + details
│   └── AlertConfigPanel.tsx            # Threshold editor
├── kiosk/
│   ├── KioskMode.tsx                   # Full-screen wrapper
│   ├── AutoRotate.ts                   # Campaign rotation
│   ├── ScreensaverPrevention.ts        # Wake Lock API
│   └── KioskConfig.tsx                 # Settings modal
└── hooks/
    ├── useLiveDashboard.ts
    ├── useCampaignMetrics.ts
    └── useAlertEngine.ts
```

**API** (enhance):
```
apps/web/src/app/api/campaigns/
├── live/route.ts                       # SSE endpoint for metrics
├── alerts/route.ts                     # Alert config CRUD
└── metrics/route.ts                    # Historical metrics (for charts)
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Metric update → chart | < 500ms | E2E |
| Alert threshold cross | Visual < 1s | E2E |
| Kiosk mode 24h | No leaks, no crash | Soak test |
| 50 campaigns | 60fps | Benchmark |
| Auto-rotate | Smooth, no flicker | Visual |
| Webhook on alert | < 2s | Integration |

## PR Guide

- Branch: `issue/017-live-campaign-dashboard`
- Phase 1: SSE metrics + basic cards + alert engine
- Phase 2: Live charts (uPlot) + drill-down
- Phase 3: Kiosk mode + auto-rotate + wake lock
- Phase 4: Alert config UI + webhook integration
- **Dependencies**: `uPlot` (fast, small), `@tanstack/react-query` (existing), Wake Lock API
- Update `docs/ARCHITECTURE.md` with live dashboard architecture

## Related Issues

- Depends on: #002 (SSE for real-time), #011 (webhook on alert)
- Blocks: #018 (scheduled dashboard snapshots)
- Related: `apps/web/src/app/campaigns/` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Real-time dashboards (SSE/WebSocket + charts)
- uPlot / Chart.js / Recharts for high-frequency updates
- Wake Lock API / kiosk mode patterns
- Alerting systems (Prometheus Alertmanager patterns)

**Key challenges:**
- Chart flicker: uPlot excels here (canvas, no React reconciliation)
- SSE reconnection: Exponential backoff, state recovery
- Kiosk: Wake Lock API not supported everywhere → fallback
- Alert evaluation: Streaming vs. polling, hysteresis

**Learning resources:**
- uPlot: https://uplot.dev/ (designed for real-time)
- Wake Lock: https://developer.mozilla.org/en-US/docs/Web/API/Wake_Lock_API
- SSE patterns: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

**Estimated effort:** 3-4 weeks
**Mentorship available:** Yes