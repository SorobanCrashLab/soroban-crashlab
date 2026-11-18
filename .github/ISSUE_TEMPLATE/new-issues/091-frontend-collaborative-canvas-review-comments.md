---
name: "Frontend: Collaborative Canvas Review Mode - Threaded Comments, Suggestions, and Approval Flows for Campaign/Workflow Designs"
description: "Add collaborative review capabilities to visual designers (campaign, automation, runbooks) with threaded comments, suggested changes, review states, and approval workflows anchored to graph nodes and edges"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Visual design artifacts (campaign graphs, automation workflows, playbooks) lack structured review workflows. Teams share screenshots or duplicate configs instead of reviewing in-context.
- No node/edge-anchored comments or suggested edits on canvas designs
- No review states (draft, in review, approved, changes requested) with auditability
- Hard to compare proposed changes vs current published blueprint
- Review feedback is disconnected from validation/simulation results

## Proposed Solution
Implement a **Collaborative Canvas Review Mode** across designer surfaces:
- Anchored threaded discussions and suggestion cards on graph elements
- Suggestion diffs (proposed node/edge/config changes) with accept/reject/merge
- Review lifecycle with required approvers, policy checks, and publish gates
- Integration with simulation/validation outputs and version history

## Requirements
### Functional
- [ ] Comment/suggestion anchors on nodes, edges, groups, and canvas regions with deep links
- [ ] Threaded discussions, mentions, resolve/reopen, and status labels (#069/#041)
- [ ] Suggested-change mode: propose edits, preview diff against baseline, accept/reject partially
- [ ] Review workflow states, reviewer assignment, approval rules, and publish blocking on unresolved items
- [ ] Side-by-side blueprint diff (structural + config) and simulation result comparison (#085/#049/#080)
- [ ] Notification hooks for review requests, responses, and approvals (#041/#049)
- [ ] Immutable audit trail for reviews, approvals, and publishes (#063/#070)

### Non-Functional
- [ ] Real-time collaboration with conflict-aware updates (#002/#003)
- [ ] Performant rendering on large graphs (200+ nodes) without UI lag
- [ ] Accessible comment markers, keyboard navigation, and screen-reader thread summaries
- [ ] Permission-aware author/reviewer/approver capabilities

## Files to Modify / Create
```
apps/web/src/features/canvas-review/
├── CanvasReviewLayer.tsx
├── SuggestionDiffPanel.tsx
├── ReviewWorkflowBar.tsx
├── approvals/
└── hooks/useCanvasReview.ts

apps/web/src/features/campaigns/designer/ (integrate)
apps/web/src/features/automation/builder/ (integrate)
apps/web/src/app/api/canvas-reviews/route.ts
docs/frontend/canvas-review-mode.md
```

## Acceptance Criteria
- Teams can review, suggest, approve, and publish canvas designs in-context
- Suggestions and diffs are precise, auditable, and linked to validation/simulation
- Permissions and real-time collaboration behave safely at scale

## PR Guide
- Branch: `issue/091-frontend-canvas-review-collaboration`
- Phase 1: anchors/threads + review state model
- Phase 2: suggestion diffs and approval workflow
- Phase 3: integrations (designer/simulation/notifications)
- Phase 4: perf/a11y/audit tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
