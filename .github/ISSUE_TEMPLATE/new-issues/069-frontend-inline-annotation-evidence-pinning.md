---
name: "Frontend: Inline Annotation & Evidence Pinning System - Collaborative Notes, Highlights, and Triage Evidence Trails"
description: "Add a cross-surface annotation system for pinning evidence (trace nodes, log lines, state diffs, artifacts, charts) with threaded comments, mentions, anchors, and durable triage trails"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Triage knowledge is lost across tools and sessions. Users can observe evidence in runs, logs, traces, and charts but cannot durably pin and discuss it in-context:
- No inline annotations on log lines, trace nodes, diff hunks, table rows, or chart points
- No evidence bundles linking multiple artifacts/views to a crash, regression, or incident
- Comments/decisions live outside the investigative context, reducing reproducibility
- Mentions, assignments, and resolution status for findings are inconsistent
- Shared links rarely preserve the exact evidence anchor and commentary

## Proposed Solution

Create a unified **Annotation & Evidence Pinning** platform:
- Anchorable annotations across core investigative surfaces (run detail, trace, diff, logs, artifacts, dashboards)
- Threaded discussions with mentions, reactions, resolve/reopen, and labels
- Evidence collections ("pins") that group anchors, screenshots/snippets, and rationale into shareable packets
- Real-time collaboration updates and notification hooks
- Immutable audit trail for triage decisions and exported evidence reports

## Requirements

### Functional
- [ ] Annotation anchor types: log line/range, trace node/span, diff hunk/path, artifact byte/region or preview element, chart point/range, table row/entity
- [ ] Threaded comments with markdown subset, mentions (@user/team), attachments/snippets, and edit/delete policies
- [ ] Resolve/reopen workflow, severity/labels, and linkage to triage items/incidents/issues (#061/#062/#066)
- [ ] Evidence pin collections: curate multiple anchors into named bundles with summary and status
- [ ] Deep-linkable anchors and collections; embedded preview cards in related views
- [ ] Real-time presence/updates for active threads and conflict-safe edits (#002/#003)
- [ ] Search/filter annotations by author, status, label, entity, and date; saved views
- [ ] Export annotation/evidence trails in reports and share links with redaction controls (#043/#053)

### Non-Functional
- [ ] Anchors resilient to minor data shifts (stable IDs + fallback heuristics)
- [ ] Low-latency rendering; annotations virtualized/lazy-loaded in dense views
- [ ] Permission-aware visibility/editing and immutable audit events (#022/#063)
- [ ] Accessible annotation markers, keyboard navigation, and screen-reader announcements
- [ ] Abuse/rate controls and safe markdown rendering

## Files to Modify / Create
```
apps/web/src/features/annotations/
├── AnnotationLayer.tsx
├── anchors/
│   ├── anchorModel.ts
│   └── resolvers.ts
├── threads/
│   ├── CommentThread.tsx
│   ├── MentionInput.tsx
│   └── ThreadComposer.tsx
├── evidence/
│   ├── EvidencePinBoard.tsx
│   └── EvidenceBundle.tsx
└── hooks/useAnnotations.ts

apps/web/src/app/api/annotations/
├── route.ts
├── threads/[id]/route.ts
└── evidence-bundles/route.ts

apps/web/src/lib/annotations/
├── permissions.ts
├── serialization.ts
└── notifications.ts
docs/frontend/annotations-evidence-pinning.md
```

## Acceptance Criteria
- Users can annotate and discuss evidence inline across traces/logs/diffs/artifacts/charts
- Evidence bundles preserve investigative context and are share/export ready
- Mentions, resolution state, and triage/incident links stay synchronized
- Anchors remain reliable across reloads and compatible view changes
- Security, auditability, and accessibility requirements are met

## PR Guide
- Branch: `issue/069-frontend-inline-annotation-evidence-pinning`
- Phase 1: anchor model + storage/API + base UI markers
- Phase 2: threaded comments, mentions, resolution, notifications
- Phase 3: evidence bundles, cross-surface integration, exports
- Phase 4: anchor resilience, permissions/audit, performance/a11y tests
- Integrate with #036/#044/#067/#068/#041/#061/#063

**Estimated effort:** 5-6 weeks (200 pts)
