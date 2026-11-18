---
name: "Real-time: Collaborative Debugging Session - Shared Replay, Live Annotations, Voice/Video Integration"
description: "Enable real-time collaborative debugging with shared replay control, synchronized annotations, integrated voice/video, and session recording for post-mortem"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Debugging crashes is currently solitary. Teams need:
- Shared replay control (everyone sees same frame)
- Live annotations on timeline/code (persisted)
- Voice/video for discussion (WebRTC)
- Session recording for knowledge sharing
- Handoff between time zones (async collaboration)

## Current State

- `apps/web/src/features/replay/` — Single-user replay
- `apps/web/src/lib/replay/` — Core replay logic
- No collaboration, no WebRTC, no session recording

## Proposed Solution

**Collaborative Debugging Room** with shared state + WebRTC:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Debugging Session: run_abc123 (Reentrancy Crash)          [🔴 REC]        │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Participants:  🟢 You (Host)  🟡 Sarah  🔵 Mike  ⚫ Alex (away)        │ │
│  │  Voice: 🟢 Connected  │  Video: 🔵 Mike only  │  Screen: 🟢 You sharing │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Shared Replay Timeline                                              │ │
│  │  0:00 ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 0:45       │ │
│  │       ▲                    ▲                                          │ │
│  │       │                    │                                          │ │
│  │    Sarah: "Look here"   Crash!                                       │ │
│  │    🟡 annotation        🔴 annotation                                │ │
│  │                                                                     │ │
│  │  [▶ Play] [⏸ Pause] [⏪ 0.1x] [1x] [2x] [🔖 Bookmark] [💬 Comment]  │ │
│  │  Control: 🟢 You (Host)  →  [Request Control]                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────┬───────────────────────────────────┐ │
│  │  Source View (Synced)           │  Annotations & Chat               │ │
│  │  contract.rs:234                │  🟡 Sarah  0:12.3                 │ │
│  │  ▸ fn withdraw() {              │     "Reentrancy guard missing"    │ │
│  │  │   let balance = ...          │  🔵 Mike   0:12.5                 │ │
│  │  │   external_call()  ◀──🟡    │     "Check line 238"              │ │
│  │  │   update_balance()           │  🟢 You    0:13.0                 │ │
│  │  │ }                             │     "Root cause confirmed"        │ │
│  │  [Linked to 0:12.3]             │  [💬 Reply] [🔗 Link Run]         │ │
│  └─────────────────────────────────┴───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Session Creation**: From run detail → "Start Debugging Session" → invite link
- [ ] **Shared Replay Control**: Host controls; others can request control; sync < 100ms
- [ ] **Live Annotations**: Click timeline → add annotation (text, voice, drawing); visible to all
- [ ] **Synced Source View**: Click annotation → jumps to code line in all views
- [ ] **WebRTC Voice/Video**: Mesh (≤4) or SFU (>4); integrated in sidebar
- [ ] **Screen Share**: Host shares replay/source view
- [ ] **Session Recording**: Record timeline + annotations + audio → export MP4/WebM
- [ ] **Async Handoff**: Leave session → annotations persist → next person sees history
- [ ] **Chat/Threaded Comments**: Per-annotation threads + general chat
- [ ] **Export**: Session summary (Markdown/PDF) with timeline, annotations, recording link

### Non-Functional

- [ ] Replay sync latency < 100ms (same region)
- [ ] WebRTC: Mesh for ≤4, SFU (mediasoup) for >4
- [ ] Recording: Server-side composition (headless Chrome) or client-side (MediaRecorder)
- [ ] E2E encryption option for voice/video (WebRTC DTLS-SRTP)
- [ ] Accessible: Screen reader announces annotations, keyboard nav

## Files to Modify / Create

```
apps/web/src/features/replay/collaborative/
├── DebuggingRoom.tsx                   # Main session UI
├── DebuggingRoom.test.tsx
├── session/
│   ├── SessionManager.ts               # Create, join, leave, handoff
│   ├── SessionState.ts                 # Shared state (Yjs CRDT)
│   ├── InviteSystem.ts                 # Links, RBAC, expiry
│   └── RecordingManager.ts             # Start/stop/compose recording
├── replay/
│   ├── SharedReplayController.ts       # Host control + request control
│   ├── SyncEngine.ts                   # Yjs + WebRTC data channel
│   ├── TimelineAnnotations.ts          # CRDT annotations on timeline
│   └── SourceSync.ts                   # Synced code view
├── webrtc/
│   ├── WebRTCManager.ts                # Mesh/SFU abstraction
│   ├── MediaHandler.ts                 # Audio/video tracks
│   ├── ScreenShare.ts                  # Screen capture
│   ├── SFUClient.ts                    # mediasoup client
│   └── Encryption.ts                   # DTLS-SRTP + optional E2E
├── recording/
│   ├── SessionRecorder.ts              # Client-side MediaRecorder
│   ├── ServerComposer.ts               # Headless Chrome composition
│   ├── ExportManager.ts                # MP4/WebM/PDF export
│   └── Storage.ts                      # S3/Blob storage + signed URLs
├── chat/
│   ├── AnnotationThread.tsx            # Per-annotation comments
│   ├── GeneralChat.tsx                 # Session chat
│   └── MessageSync.ts                  # Yjs text
└── hooks/
    ├── useDebuggingSession.ts
    ├── useSharedReplay.ts
    ├── useWebRTC.ts
    └── useSessionRecording.ts
```

**Backend** (new):
```
apps/web/src/app/api/replay/sessions/
├── route.ts                            # CRUD sessions
├── invite/route.ts                     # Invite links
├── recording/route.ts                  # Recording upload/status
├── webrtc/
│   ├── signal/route.ts                 # WebRTC signaling
│   └── sfu/route.ts                    # SFU connection
└── export/route.ts                     # Generate summary PDF
```

**SFU** (optional, separate service):
```
services/mediasoup-sfu/
├── package.json
├── src/
│   ├── server.ts
│   ├── room.ts
│   └── peer.ts
└── Dockerfile
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| 4 users shared replay | < 100ms sync | E2E |
| Annotation appears | < 200ms | E2E |
| Voice connect | < 2s | E2E |
| Recording 30min | < 5min compose | Benchmark |
| Handoff (leave/join) | Annotations persist | E2E |
| Export PDF | Valid, complete | Manual |

## PR Guide

- Branch: `issue/016-collaborative-debugging-session`
- Phase 1: Session + shared replay + annotations (Yjs)
- Phase 2: WebRTC voice/video + screen share
- Phase 3: Recording (client + server) + export
- Phase 4: Async handoff + chat + summary export
- **Dependencies**: `yjs`, `y-webrtc` or `mediasoup-client`, `mediastream-recorder`
- Update `docs/ARCHITECTURE.md` with collaborative debugging architecture

## Related Issues

- Depends on: #002 (SSE for session state), #003 (collaborative triage), #009 (replay timeline)
- Blocks: #018 (scheduled session summaries)
- Related: `replay.ts`, `replay-ui-utils.ts` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- WebRTC (Mesh, SFU, mediasoup)
- Yjs CRDT for shared state
- MediaRecorder API / headless Chrome recording
- Real-time collaborative apps (Figma, Google Docs patterns)

**Key challenges:**
- WebRTC signaling: Custom vs. mediasoup
- Sync replay: Frame-accurate across network
- Recording: Client-side (easy, limited) vs server-side (hard, full)
- E2E encryption: Key exchange in WebRTC

**Learning resources:**
- mediasoup: https://mediasoup.org/
- Yjs + WebRTC: https://docs.yjs.dev/ecosystem/network-providers/y-webrtc
- MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Chrome headless recording: https://github.com/puppeteer/puppeteer

**Estimated effort:** 6-8 weeks
**Mentorship available:** Yes — WebRTC expert on team