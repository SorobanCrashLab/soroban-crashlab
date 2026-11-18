---
name: "Frontend: Replay Timeline Scrubber - Frame-Accurate Synchronized Multi-Run Replay with Variable Speed & Bookmarks"
description: "Build a professional-grade timeline scrubber for transaction replay with frame-accurate seeking, synchronized multi-run playback, variable speed (0.1x-10x), and persistent bookmarks"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current `TimelineScrubber.tsx` and `replay-ui-utils.ts` are basic:
- Second-level granularity only (no frame/instruction accuracy)
- Single run only
- Fixed playback speed
- No bookmarks / annotations on timeline
- No synchronized multi-run scrubbing
- No keyboard shortcuts for precise control

## Current State

- `apps/web/src/app/TimelineScrubber.tsx` — Basic slider
- `replay-ui-utils.ts` — Minimal utilities
- `replay.ts` — Basic types
- No synchronization, no variable speed, no bookmarks

## Proposed Solution

**Professional Replay Timeline** with frame accuracy and multi-run sync:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Replay: run_abc123  🔴 LIVE  |  run_def456  ⏸ PAUSED  [+ Sync Run]         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  0:00.000 ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 0:45.231 │ │
│  │         ▲                                                     ▲         │ │
│  │         │                                                     │         │ │
│  │      Bookmark: "Reentrancy entry"                          Crash!      │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │ │
│  │  │  Instruction: 1,247,382 / 2,100,000  |  Gas: 847,231 / 1,200,000 │   │ │
│  │  │  ▸ 0x1a2b: CALL 0x3c4d  |  ▸ 0x5e6f: SSTORE  |  ⬤ 0x7a8b: REVERT   │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  [⏪ 0.1x] [⏪ 0.5x] [⏸] [▶ 1x] [▶ 2x] [▶ 5x] [▶ 10x]  [🔖 Bookmark] [🔁 Loop] │
│  Shortcuts: ←/→ frame  |  Shift←/→ 10 frames  |  Space play/pause  |  B bookmark │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Frame-accurate seeking**: Instruction-level granularity (not just seconds)
- [ ] **Variable speed**: 0.1x, 0.25x, 0.5x, 1x, 2x, 5x, 10x (with pitch-corrected audio if any)
- [ ] **Synchronized multi-run**: Lock playheads → scrub one, all move proportionally
- [ ] **Bookmarks**: Named, colored, persistent (localStorage + shareable URL)
- [ ] **Annotations on timeline**: Crash points, external events (deployments), custom markers
- [ ] **Loop region**: Set A/B points → loop playback
- [ ] **Keyboard shortcuts**: Full VCR-style control (space, arrows, J/K/L, numbers for speed)
- [ ] **Waveform/mini-map**: Overview bar with crash density, gas usage, instruction density
- [ ] **Export**: Bookmark list as JSON, timeline screenshot, GIF of playback

### Non-Functional

- [ ] Seek latency < 50ms (local) / < 200ms (remote via SSE)
- [ ] 60fps scrubber drag at 1M+ instructions
- [ ] Memory: < 10MB for 10M instruction timeline (virtualized mini-map)
- [ ] Bundle size < 40KB gzip
- [ ] Accessible: ARIA slider, keyboard nav, screen reader announces position/events

## Files to Modify / Create

```
apps/web/src/features/replay/timeline/
├── ReplayTimeline.tsx                  # Main scrubber component
├── ReplayTimeline.test.tsx
├── scrubber/
│   ├── TimelineScrubber.tsx            # Main slider + playhead
│   ├── MiniMap.tsx                     # Overview bar (virtualized)
│   ├── Playhead.tsx                    # Draggable playhead with tooltip
│   ├── BookmarkMarkers.tsx             # Bookmark + annotation markers
│   └── LoopRegion.tsx                  # A/B loop handles
├── playback/
│   ├── PlaybackController.ts           # Speed, direction, sync state
│   ├── MultiRunSync.ts                 # Proportional sync across runs
│   ├── FrameAccurateSeeker.ts          # Instruction → timestamp mapping
│   └── usePlayback.ts
├── bookmarks/
│   ├── BookmarkManager.ts              # CRUD + persistence
│   ├── BookmarkMarker.tsx              # Timeline marker UI
│   ├── BookmarkPanel.tsx               # Side panel list
│   └── useBookmarks.ts
├── annotations/
│   ├── TimelineAnnotations.ts          # Crash points, deployments, custom
│   ├── AnnotationLayer.tsx             # Renders on timeline + mini-map
│   └── useTimelineAnnotations.ts
├── shortcuts/
│   ├── KeyboardShortcuts.ts            # VCR-style mapping
│   ├── ShortcutHelp.tsx                # ? key overlay
│   └── useTimelineShortcuts.ts
└── hooks/
    ├── useReplayTimeline.ts            # Main state
    ├── useTimelineSync.ts              # Multi-run sync
    └── useFrameSeeking.ts
```

**API** (enhance):
```
apps/web/src/app/api/replay/
├── timeline/route.ts                   # GET ?runId=X&instruction=Y → timestamp, state
├── bookmarks/route.ts                  # CRUD (persisted to DB for sharing)
└── sync/route.ts                       # SSE for multi-run sync coordination
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Seek to instruction 1,000,000 | < 50ms | Benchmark |
| 10x playback smooth | 60fps | Visual |
| Sync 3 runs | < 100ms drift | E2E |
| Add bookmark | < 10ms | Unit |
| Keyboard shortcut response | < 16ms | Benchmark |
| Mini-map (1M frames) | < 10MB mem | Heap snapshot |

## PR Guide

- Branch: `issue/009-replay-timeline-scrubber-pro`
- Phase 1: Frame-accurate scrubber + variable speed + mini-map
- Phase 2: Multi-run sync + bookmarks + annotations
- Phase 3: Keyboard shortcuts + loop region + export
- Phase 4: Accessibility + performance optimization
- **Dependencies**: None new (existing `replay.ts` types)
- Update `docs/ARCHITECTURE.md` with replay timeline architecture

## Related Issues

- Depends on: #002 (SSE for multi-run sync), #006 (comparison needs sync)
- Blocks: #015 (collaborative debugging session)
- Related: `TimelineScrubber.tsx`, `replay-ui-utils.ts` (legacy — replace)

## Contributor Notes

**Start here if:** You have experience with:
- High-performance slider/scrubber components
- Video/audio playback synchronization
- Virtualized rendering for large timelines
- Keyboard shortcut systems (Mousetrap, hotkeys-js patterns)

**Key challenges:**
- Frame-accurate seek: Mapping instruction index → timestamp → state (requires core API support)
- Multi-run sync: Proportional time vs. instruction count vs. wall clock
- Mini-map virtualization: 1M+ frames → Canvas/WebGL, not DOM
- Keyboard shortcuts: No conflict with browser/OS/global app shortcuts

**Learning resources:**
- Video.js scrubber: https://videojs.com/ (reference implementation)
- Virtualized timeline: https://github.com/bvaughn/react-virtualized/tree/master/source/CollectionView
- Keyboard shortcuts: https://github.com/jaywcjlove/hotkeys

**Estimated effort:** 3-4 weeks
**Mentorship available:** Yes