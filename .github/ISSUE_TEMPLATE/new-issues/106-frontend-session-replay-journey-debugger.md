---
name: "Frontend: User Session Replay & Journey Debugger - DOM/Event Timelines, Network Correlation, and UX Failure Forensics"
description: "Implement privacy-aware session replay and journey debugging for the web app with event timelines, network/state correlation, error overlays, and reproducible UX issue investigation"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Frontend bugs, performance issues, and confusing UX states are hard to reproduce from issue reports alone:
- No session-level timeline correlating user actions, route changes, UI state, network calls, and errors
- Support/maintainers rely on incomplete screenshots or manual reproduction steps
- Performance and interaction regressions lack contextual playback
- Any replay system must protect sensitive data and respect permissions/consent

## Proposed Solution
Build a **Session Replay & Journey Debugger**:
- Privacy-aware capture of DOM snapshots/mutations (or structured UI events), interactions, navigation, console/network metadata
- Replay player with timeline, scrubber, speed controls, and event markers
- Correlation with frontend errors, web vitals, feature flags, and backend request IDs (#059/#029/#014)
- Redaction/masking controls, consent gating, and secure share/export of replay bundles

## Requirements
### Functional
- [ ] Capture pipeline for interactions, route transitions, key UI state, network timing/status, console/error events
- [ ] Replay viewer: play/pause/scrub, event list, breakpoints, and side panels for network/state/errors
- [ ] Journey analytics: funnels/paths for common flows (triage, campaign setup, run investigation) (#078)
- [ ] Correlation to backend traces/logs via request IDs and issue/incident links (#014/#075/#066)
- [ ] Redaction rules (inputs, secrets, PII), allow/deny selectors, and sampling/consent controls (#025/#070)
- [ ] Share/export replay sessions with time-bounded access and audit logging (#053/#063)
- [ ] Developer mode for local reproduction bundles attachable to bug reports

### Non-Functional
- [ ] Minimal runtime overhead and configurable sampling; no impact when disabled
- [ ] Secure storage/encryption and strict retention policies
- [ ] Robust playback for SPA route changes and dynamic content; graceful gaps on missing data
- [ ] Accessible player controls and transcripts/summaries of key events

## Files to Modify / Create
```
apps/web/src/features/session-replay/
├── capture/
│   ├── recorder.ts
│   ├── redaction.ts
│   └── transport.ts
├── player/
│   ├── ReplayPlayer.tsx
│   ├── TimelinePanel.tsx
│   ├── NetworkPanel.tsx
│   └── ErrorPanel.tsx
├── hooks/useSessionReplay.ts
└── privacy/

apps/web/src/app/support/session-replay/[id]/page.tsx
apps/web/src/app/api/session-replay/route.ts
docs/frontend/session-replay-journey-debugger.md
```

## Acceptance Criteria
- Authorized users can replay sessions to diagnose UX/frontend issues with correlated context
- Privacy/consent/redaction controls prevent sensitive data leakage
- Performance overhead and retention/security constraints are enforced
- Replay artifacts can be shared/exported for bug/incident workflows

## PR Guide
- Branch: `issue/106-frontend-session-replay-journey-debugger`
- Phase 1: capture schema + privacy/redaction + ingestion
- Phase 2: replay player/timeline + correlation panels
- Phase 3: sharing/export/retention + integrations
- Phase 4: overhead tuning, security/a11y, tests/docs

**Estimated effort:** 8+ weeks (200 pts)
