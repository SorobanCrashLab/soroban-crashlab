---
name: "Integration: Slack & PagerDuty Bidirectional Integration - Rich Alerts, Incident Management & ChatOps Commands"
description: "Build comprehensive Slack and PagerDuty integrations with rich message formatting, interactive components, incident lifecycle sync, and slash commands for common operations"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current integrations (`apps/web/src/app/integrations/slack/`, `pagerduty/`) are minimal:
- Slack: Basic webhook posting only
- PagerDuty: Basic event creation only
- No bidirectional sync (acknowledge in Slack → PagerDuty)
- No ChatOps commands (`/crashlab status`, `/crashlab replay`)
- No rich message formatting (blocks, modals, threads)
- No incident timeline sync

## Current State

- `apps/web/src/app/integrations/slack/` — Basic incoming webhook
- `apps/web/src/app/integrations/pagerduty/` — Basic Events API v2
- `apps/web/src/lib/webhook-manager.ts` — Generic manager
- No Slack App, no Bot token, no Interactivity

## Proposed Solution

**Bidirectional ChatOps Platform** with Slack App + PagerDuty integration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Slack Integration                                              [⚙️ Config] │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  📢 Alert Channels                                                     │ │
│  │  #crashlab-alerts     │ 🟢 Connected  │  Campaign crashes, DLQ growth  │ │
│  │  #crashlab-deploys    │ 🟢 Connected  │  Deployment notifications      │ │
│  │  #crashlab-weekly     │ 🟡 Pending    │  Weekly digest (config)        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  🤖 Slack App: @CrashLab Bot                                           │ │
│  │  Commands:                                                              │ │
│  │  /crashlab runs              → List recent runs (interactive)          │ │
│  │  /crashlab run <id>          → Run detail with buttons                 │ │
│  │  /crashlab replay <id>       → Start replay, post updates in thread    │ │
│  │  /crashlab compare <id> <id> → Comparison link                         │ │
│  │  /crashlab alert <campaign>  → Configure alerts for campaign           │ │
│  │  /crashlab status            → System health + queue depth             │ │
│  │                                                                         │ │
│  │  Interactive:  [Acknowledge] [View in CrashLab] [Replay] [Silence 1h]  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  🔄 PagerDuty Sync                                                      │ │
│  │  Service: CrashLab Fuzzing  │  Escalation Policy: Critical → Team     │ │
│  │  Sync:  ✓ Incidents ↔ Alerts  ✓ Acknowledgments  ✓ Resolutions        │ │
│  │  Severity Mapping:  Crash=Critical  DLQ=Warning  Flaky=Info            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

**Slack App** (first-class, published to App Directory):
- [ ] **Bot Token + Socket Mode**: Real-time events without public URL
- [ ] **Slash Commands**: `/crashlab` with subcommands (above)
- [ ] **Interactive Messages**: Block Kit with buttons, selects, modals
- [ ] **Threaded Alerts**: Each alert in thread; replies sync to CrashLab comments
- [ ] **Rich Formatting**: Crash cards with metrics, sparklines, action buttons
- [ ] **Channel Config**: Per-channel alert rules (campaign, severity, schedule)
- [ ] **Digest Messages**: Daily/weekly summary with charts (Canvas API)
- [ ] **App Home**: Personalized dashboard per user

**PagerDuty** (Events API v2 + REST API):
- [ ] **Incident Lifecycle**: Trigger → Acknowledge → Resolve (bidirectional)
- [ ] **Severity Mapping**: Configurable CrashLab → PD severity
- [ ] **Deduplication**: CrashLab signature → PD dedup key (prevent spam)
- [ ] **Custom Fields**: Run ID, campaign, crash type in PD incident
- [ ] **Escalation Sync**: PD escalation → CrashLab notification
- [ ] **On-Call Override**: Show current on-call in CrashLab UI

### Non-Functional

- [ ] Slack App: Socket Mode (no inbound webhooks needed)
- [ ] PagerDuty: Events API v2 (v1 deprecated)
- [ ] Rate limits respected: Slack (Tier 4), PD (120 req/min)
- [ ] HA: Multiple bot instances via Socket Mode sharding
- [ ] Security: Request signing verification, token rotation

## Files to Modify / Create

```
apps/web/src/integrations/slack/
├── app/
│   ├── SlackApp.ts                     # Bolt.js app (Socket Mode)
│   ├── SocketModeHandler.ts            # Sharding support
│   ├── CommandRegistry.ts              # /crashlab subcommands
│   ├── BlockBuilder.ts                 # Block Kit helpers
│   └── ModalBuilder.ts                 # Modals for config
├── commands/
│   ├── RunsCommand.ts                  # /crashlab runs
│   ├── RunDetailCommand.ts             # /crashlab run <id>
│   ├── ReplayCommand.ts                # /crashlab replay <id>
│   ├── CompareCommand.ts               # /crashlab compare
│   ├── AlertCommand.ts                 # /crashlab alert
│   └── StatusCommand.ts                # /crashlab status
├── messages/
│   ├── CrashAlertBuilder.ts            # Rich crash card
│   ├── DigestBuilder.ts                # Daily/weekly digest
│   ├── RunStatusBuilder.ts             # Run updates
│   └── ThreadSync.ts                   # Thread ↔ CrashLab comments
├── config/
│   ├── ChannelConfigManager.ts         # Per-channel rules
│   ├── AlertRuleEngine.ts              # Match campaigns/severity
│   └── DigestScheduler.ts              # Cron for digests
└── oauth/
    ├── SlackOAuth.ts                   # App installation flow
    ├── TokenRotation.ts                # Bot token rotation
    └── Scopes.ts                       # Required scopes

apps/web/src/integrations/pagerduty/
├── PagerDutyClient.ts                  # Events API v2 + REST
├── IncidentSync.ts                     # Bidirectional sync
├── SeverityMapper.ts                   # CrashLab ↔ PD mapping
├── DeduplicationKeys.ts                # Signature-based dedup
├── EscalationSync.ts                   # PD escalation → CrashLab
├── OnCallProvider.ts                   # Current on-call lookup
└── ui/
    ├── PagerDutyConfig.tsx             # Service + policy config
    ├── IncidentTimeline.tsx            # Synced timeline
    └── OnCallDisplay.tsx               # In CrashLab header
```

**API Routes** (new):
```
apps/web/src/app/api/integrations/
├── slack/
│   ├── commands/route.ts               # Slash command endpoint
│   ├── interactions/route.ts           # Block actions, modals
│   ├── events/route.ts                 # Event subscriptions
│   └── oauth/route.ts                  # Installation callback
└── pagerduty/
    ├── events/route.ts                 # PD webhook receiver
    ├── incidents/route.ts              # Incident CRUD proxy
    └── oncall/route.ts                 # On-call schedule
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| `/crashlab runs` response | < 2s | E2E |
| Crash alert → Slack | < 3s | E2E |
| Slack ack → PD ack | < 5s | E2E |
| PD resolve → Slack update | < 5s | E2E |
| Digest generation | < 10s | Benchmark |
| Socket Mode sharding | 10k connections | Load test |

## PR Guide

- Branch: `issue/013-slack-pagerduty-bidirectional`
- Phase 1: Slack App (Socket Mode) + slash commands + basic alerts
- Phase 2: Interactive messages + thread sync + digests
- Phase 3: PagerDuty bidirectional sync + severity mapping
- Phase 4: On-call integration + UI config + App Directory prep
- **Dependencies**: `@slack/bolt`, `@slack/web-api`, `@pagerduty/pdjs`
- Update `docs/INTEGRATIONS.md` with Slack + PD guides

## Related Issues

- Depends on: #002 (SSE for real-time command responses), #011 (webhook reliability)
- Blocks: #018 (scheduled digest configuration)
- Related: `apps/web/src/app/integrations/slack/`, `pagerduty/` (replace)

## Contributor Notes

**Start here if:** You have experience with:
- Slack Bolt.js (Socket Mode, Block Kit, Modals)
- PagerDuty Events API v2 + REST API
- ChatOps patterns (Hubot, Probot, Bolt)
- Real-time bidirectional sync

**Key challenges:**
- Socket Mode: Sharding for HA, connection lifecycle
- Block Kit: Complex layouts, accessibility, mobile
- PagerDuty dedup: Signature must be stable across runs
- Bidirectional sync: Conflict resolution (both sides change)

**Learning resources:**
- Bolt.js: https://slack.dev/bolt-js/
- Block Kit Builder: https://app.slack.com/block-kit-builder
- PagerDuty API: https://developer.pagerduty.com/docs/ZG9jOjI3NDc1Ng-introduction
- ChatOps: https://github.com/github/hubot/blob/master/docs/chatops.md

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes