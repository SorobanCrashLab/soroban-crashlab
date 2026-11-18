---
name: "Frontend: Unified Diff Review Workbench - Multi-Format Diffs, Review Comments, and Approval Flows Across Artifacts"
description: "Create a unified diff review workbench for code/config/trace/state/snapshot artifacts with semantic diff modes, inline review comments, approvals, and evidence linkage"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Review workflows in CrashLab span many diffable artifacts (configs, blueprints, snapshots, traces, state, reports), each with bespoke viewers:
- No consistent diff UX, navigation, or review/approval mechanics
- Semantic diffs (trace/state/graph) are not first-class alongside text diffs
- Review comments and decisions are fragmented and hard to audit
- Comparing multi-file/multi-artifact change sets lacks cohesion

## Proposed Solution
Build a **Unified Diff Review Workbench**:
- Pluggable diff renderers (text, JSON/structured, image/snapshot, trace/state semantic)
- Multi-artifact change sets with navigation, filters, and impact summaries
- Inline comments/suggestions, review states, approvals, and policy gates
- Deep integration with CI, incidents, releases, and canvas/report artifacts

## Requirements
### Functional
- [ ] Diff renderer framework supporting text, tree/JSON, image, and semantic trace/state adapters (#067/#072/#077)
- [ ] Change-set view: file/artifact tree, status filters, risk tags, and summary metrics
- [ ] Inline threaded comments, suggestions, resolve/reopen, and review decisions (#069/#091)
- [ ] Approval workflows with required reviewers/checks and merge/publish gating hooks (#063/#070/#093/#102)
- [ ] Compare arbitrary revisions/entities (runs, blueprints, configs, reports) with shareable links (#056)
- [ ] Evidence attachments and links to incidents/issues/runbooks (#066/#062/#080)
- [ ] Export review summaries and decision logs (#043/#092)

### Non-Functional
- [ ] Performant rendering for large diffs and many artifacts (virtualization/lazy load)
- [ ] Deterministic diff computation/presentation for identical inputs
- [ ] Accessible diff navigation (keyboard, announcements, high contrast)
- [ ] Secure rendering/sanitization for untrusted content

## Files to Modify / Create
```
apps/web/src/features/diff-review/
├── DiffReviewWorkbench.tsx
├── renderers/
│   ├── TextDiffRenderer.tsx
│   ├── StructuredDiffRenderer.tsx
│   ├── SnapshotDiffRenderer.tsx
│   └── SemanticDiffRenderer.tsx
├── review/
│   ├── CommentThreads.tsx
│   └── ApprovalPanel.tsx
└── hooks/useDiffReview.ts

apps/web/src/app/reviews/diffs/page.tsx
apps/web/src/app/api/reviews/diffs/route.ts
docs/frontend/unified-diff-review-workbench.md
```

## Acceptance Criteria
- Multi-format diffs can be reviewed, discussed, approved, and audited in one workbench
- Semantic artifact diffs integrate with domain views and evidence
- Performance, accessibility, and security requirements met

## PR Guide
- Branch: `issue/112-frontend-unified-diff-review-workbench`
- Phase 1: renderer framework + change-set navigation
- Phase 2: comments/suggestions + approvals/policy hooks
- Phase 3: semantic adapters/integrations + exports
- Phase 4: perf/a11y/security tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
