---
name: "Frontend: Collaborative Run Triage - Real-time Multi-user Session with Presence & Conflict Resolution"
description: "Enable multiple team members to triage runs simultaneously with live cursors, presence indicators, optimistic locking, and CRDT-based conflict resolution"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Triage is currently **single-user**: one person opens a run, assigns tags, adds notes, links issues. No visibility into who else is viewing/editing. This causes:

- **Duplicate work**: Two engineers triage same run independently
- **Lost updates**: Last-write-wins overwrites concurrent tag/note changes
- **No context**: Can't see "Sarah is looking at this crash" before diving in
- **Meeting friction**: Screen-share required for collaborative debugging

## Current State

- `apps/web/src/app/runs/[id]/page.tsx` — run detail page
- `apps/web/src/components/RunMetadataEditor.tsx` — tags, notes, issue links
- No presence, no locking, no conflict resolution

## Proposed Solution

**Collaborative Triage Session** using **Yjs CRDT** + **WebRTC / WebSocket** for peer-to-peer with central relay:

```
┌─────────────────────────────────────────────────────────────────┐
│  Run Detail Page (per run ID)                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Presence Bar (top)                                        │  │
│  │  🟢 You  🟡 Sarah (editing tags)  🔵 Mike (viewing)        │  │
│  │  🟠 Alex (away 2m)  ⚫ Jordan (offline)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Crash Detail (shared Yjs doc)                             │  │
│  │  • Tags: [CRDT Array] — real-time merge                    │  │
│  │  • Notes: [CRDT Text] — concurrent editing                 │  │
│  │  • Issue Links: [CRDT Map] — add/remove sync               │  │
│  │  • Cursor positions: [Yjs Awareness] — live pointers       │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Conflict Banner (if auto-merge fails)                     │  │
│  │  "Sarah changed 'tags' while you edited. [Accept] [Merge]" │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Backend**: Yjs + `y-websocket` (or `y-webrtc` for P2P) with Redis persistence

## Requirements

### Functional

- [ ] **Presence**: Show all users viewing same run (avatar, name, status: editing/viewing/away)
- [ ] **Live cursors**: See other users' text selections in notes/tags fields
- [ ] **Concurrent editing**: Tags (array), Notes (rich text), Issue links (map) — all CRDT
- [ ] **Conflict resolution**: Auto-merge for 95% cases; manual resolution UI for conflicts
- [ ] **Optimistic locking**: "Take ownership" button for exclusive edit mode (5-min TTL)
- [ ] **Activity feed**: Sidebar showing "Sarah added tag 'reentrancy'", "Mike linked #1234"
- [ ] **Offline support**: Local-first — sync when reconnected (IndexedDB + Yjs `y-indexeddb`)
- [ ] **Permission integration**: Respect RBAC — only `triage:write` can edit

### Non-Functional

- [ ] < 100ms latency for local→remote sync (same region)
- [ ] Support 20+ concurrent users per run
- [ ] Zero data loss: CRDT guarantees eventual consistency
- [ ] Bundle size: Yjs + providers < 40KB gzip
- [ ] Works in Safari (WebRTC limitations) → fallback to WebSocket relay
- [ ] Accessible: Screen reader announces "Sarah started editing tags"

## Files to Modify / Create

```
apps/web/src/features/triage/collaborative/
├── CollaborativeTriageSession.tsx      # Main provider + UI
├── CollaborativeTriageSession.test.tsx
├── presence/
│   ├── PresenceBar.tsx                 # Top bar with avatars
│   ├── PresenceAvatar.tsx              # Individual avatar + status
│   └── usePresence.ts                  # Yjs Awareness hook
├── editors/
│   ├── CollaborativeTagsEditor.tsx     # CRDT array (tags)
│   ├── CollaborativeNotesEditor.tsx    # CRDT rich text (TipTap + Yjs)
│   ├── CollaborativeIssueLinks.tsx     # CRDT map (issue links)
│   └── ConflictResolutionBanner.tsx    # Manual conflict UI
├── cursors/
│   ├── RemoteCursor.tsx                # Other users' cursors
│   └── useRemoteCursors.ts
├── yjs/
│   ├── yjsProvider.ts                  # WebSocket/WebRTC provider
│   ├── docSchema.ts                    # Yjs types: Array, Text, Map
│   ├── persistence.ts                  # Redis + IndexedDB sync
│   └── awareness.ts                    # Custom awareness states
└── hooks/
    ├── useCollaborativeTriage.ts       # Main hook
    └── useOptimisticLock.ts            # Exclusive edit mode
```

**Backend** (new API routes):
```
apps/web/src/app/api/triage/collaborative/
├── yjs-websocket/route.ts              # y-websocket server (Node.js)
├── yjs-websocket/redis-adapter.ts      # Redis pub/sub for multi-instance
└── auth.ts                             # JWT → Yjs permissions
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Two users edit tags simultaneously | Auto-merge, no loss | E2E: Playwright 2 tabs |
| User adds note, another edits same paragraph | CRDT merge | Unit: Yjs doc |
| Network disconnect 30s → reconnect | Full sync, no conflicts | Chaos test |
| 20 users viewing same run | Presence updates < 200ms | Load test |
| Offline edit → online sync | No data loss | IndexedDB test |
| Conflict: same tag deleted + modified | Manual resolution UI | E2E |

## PR Guide

- Branch: `issue/003-collaborative-run-triage`
- Phase 1: Yjs setup + presence (read-only)
- Phase 2: Collaborative editors (tags, notes, links)
- Phase 3: Conflict resolution + optimistic locking
- Phase 4: Offline support + persistence
- **Dependencies**: `yjs`, `y-websocket`, `@tiptap/extension-collaboration` (maintainer approval)
- Update `docs/ARCHITECTURE.md` with collaborative editing architecture

## Related Issues

- Depends on: #002 (real-time streaming for presence), #008 (notification center)
- Blocks: #015 (collaborative debugging session)
- Related: RBAC system (`apps/web/src/lib/rbac.ts`)

## Contributor Notes

**Start here if:** You have experience with:
- CRDTs (Yjs, Automerge, RON)
- Real-time collaboration (Figma, Google Docs patterns)
- WebRTC / WebSocket signaling
- TipTap / ProseMirror for rich text

**Key challenges:**
- Yjs + TipTap integration for rich text notes
- WebRTC signaling server for P2P (or use `y-websocket` relay)
- Permission mapping: RBAC → Yjs doc permissions
- Safari WebRTC limitations → graceful WebSocket fallback

**Learning resources:**
- Yjs docs: https://docs.yjs.dev/
- Yjs + TipTap: https://tiptap.dev/editor-extensions/collaboration
- CRDT theory: https://crdt.tech/

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes — CRDT expert on team