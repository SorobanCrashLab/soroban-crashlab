---
name: "Frontend: Collaborative Triage Whiteboard Canvas - Real-Time Evidence Mapping, Diagramming, and Shared Investigation Spaces"
description: "Build a real-time collaborative whiteboard for triage teams to map evidence, draw failure hypotheses, link runs/traces/artifacts, and co-author investigation narratives directly in the product"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Complex Soroban failures often require spatial reasoning across many artifacts (runs, traces, logs, state diffs, issues). Linear lists and comment threads are insufficient for collaborative sensemaking:
- No shared canvas to visually connect evidence, hypotheses, and mitigation steps
- Investigators duplicate diagrams outside the app, losing deep links and provenance
- Real-time collaboration, presence, and conflict resolution are missing for triage sessions
- Whiteboard outputs are not auditable or convertible into reports/runbooks/issues

## Proposed Solution
Implement a **Collaborative Triage Whiteboard Canvas**:
- Infinite canvas with nodes/cards (run, crash, trace span, log excerpt, state diff, note, task) and relationship edges
- Real-time multi-user editing with presence, cursors, comments, and version history
- Diagram primitives (flow, sequence, grouping, swimlanes) and auto-layout/snap tools
- Evidence embedding with live previews and deep links into native inspectors
- Export/convert canvas regions into incident timelines, reports, and playbook steps

## Requirements
### Functional
- [ ] Canvas primitives: sticky notes, shapes, connectors, frames, text, markdown cards, and evidence nodes
- [ ] Entity cards that reference runs/crashes/traces/logs/artifacts/issues with live status badges (#036/#068/#075/#062)
- [ ] Real-time collaboration: presence avatars, cursors, selection, locking/conflict handling, undo/redo (#002/#003)
- [ ] Comment threads, mentions, reactions, and anchor-to-node discussions (#069/#041)
- [ ] Templates for RCA, regression triage, incident timeline, and fuzz campaign review
- [ ] Canvas-to-report/runbook conversion and PNG/SVG/PDF/JSON export (#092/#080/#043)
- [ ] Version history, snapshots, restore, and shareable read/comment/edit links (#056/#053)
- [ ] Permission-aware access, redaction of embedded sensitive data, and audit trail (#070/#063)

### Non-Functional
- [ ] Smooth 60fps interactions for canvases with 1k+ objects (spatial indexing/virtualization)
- [ ] Deterministic serialization for diffs/versioning and reproducible exports
- [ ] Offline-tolerant draft mode with merge/reconciliation on reconnect (#039)
- [ ] Full keyboard accessibility, screen-reader labels for canvas objects, and reduced-motion support (#038/#096)

## Files to Modify / Create
```
apps/web/src/features/whiteboard/
├── TriageWhiteboard.tsx
├── canvas/
│   ├── CanvasEngine.ts
│   ├── NodeRegistry.ts
│   ├── EdgeRenderer.ts
│   └── SelectionManager.ts
├── collaboration/
│   ├── PresenceLayer.tsx
│   ├── RealtimeSync.ts
│   └── ConflictResolver.ts
├── evidence/
│   └── EvidenceNodeCards.tsx
├── export/
└── hooks/useWhiteboard.ts

apps/web/src/app/investigations/whiteboard/[id]/page.tsx
apps/web/src/app/api/whiteboards/route.ts
docs/frontend/triage-whiteboard-canvas.md
```

## Acceptance Criteria
- Teams can co-create linked investigation canvases in real time without data loss
- Evidence nodes stay synchronized with source entities and respect permissions
- Canvases are versioned, exportable, and convertible into reports/runbooks
- Performance and accessibility targets met on large boards

## PR Guide
- Branch: `issue/103-frontend-triage-whiteboard-canvas`
- Phase 1: canvas engine + entity nodes + persistence
- Phase 2: real-time collaboration/presence + comments
- Phase 3: templates, export/conversion, versioning
- Phase 4: perf/a11y/security hardening, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
