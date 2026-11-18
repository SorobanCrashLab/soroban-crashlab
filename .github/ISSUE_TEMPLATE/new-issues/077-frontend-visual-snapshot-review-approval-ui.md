---
name: "Frontend: Visual Snapshot Review & Approval UI - PR/CI Artifact Triage, Diff Annotation, and Baseline Governance"
description: "Build a dedicated UI for reviewing visual regression snapshots from CI with side-by-side diffs, annotations, approval/rejection flows, baseline updates, and auditability"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Visual regression testing exists in CI workflows, but reviewing snapshot diffs is cumbersome and disconnected from triage workflows:
- Snapshot diffs are hard to browse across routes/components/themes/viewports
- No centralized approve/reject/baseline-update workflow with rationale and ownership
- Flaky visual changes (animations, timing, anti-aliasing) are difficult to classify and suppress safely
- Review context (PR, commit, test run, environment) is not linked to CrashLab UI evidence
- Governance/audit for baseline changes is limited

## Proposed Solution
Create a **Visual Snapshot Review & Approval UI**:
- CI artifact ingestion and indexed browser for snapshot runs, suites, and changed files
- Side-by-side, overlay, slider, and difference-highlight diff viewers
- Annotation, classification (bug/intended/flaky), and approval workflow with required checks
- Baseline governance: proposed updates, approvals, history, and rollback references
- Integration with PR/check status and notifications

## Requirements
### Functional
- [ ] Import and index snapshot artifacts from CI runs (by PR/branch/commit/suite)
- [ ] Browse/filter changes by status, component/route, viewport, theme, browser, and flake score
- [ ] Diff modes: side-by-side, onion-skin/slider, pixel diff heatmap, synchronized zoom/pan
- [ ] Annotation and review actions: comment, mark intended/bug/flaky, request changes, approve baseline update
- [ ] Baseline update workflow with batch actions, guardrails, and audit trail (#063)
- [ ] Link to source/test metadata and related failures/logs; surface CI status context (#093)
- [ ] Notifications and assignee/reviewer routing for pending snapshot reviews (#041/#061)
- [ ] Export review summary reports for PRs/releases

### Non-Functional
- [ ] Efficient loading of large image sets (lazy loading, thumbnails, caching)
- [ ] Deterministic diff rendering and configurable thresholds/masks
- [ ] Permission-aware approval actions and protected baseline operations (#070)
- [ ] Accessible review controls and keyboard-driven navigation

## Files to Modify / Create
```
apps/web/src/features/visual-review/
├── SnapshotReviewDashboard.tsx
├── SnapshotDiffViewer.tsx
├── ReviewQueue.tsx
├── BaselineApprovalPanel.tsx
└── hooks/useVisualReview.ts

apps/web/src/app/quality/visual-snapshots/page.tsx
apps/web/src/app/api/visual-snapshots/runs/route.ts
apps/web/src/app/api/visual-snapshots/reviews/route.ts
apps/web/src/lib/visual-review/
├── ingest.ts
├── diffConfig.ts
└── governance.ts
docs/frontend/visual-snapshot-review.md
```

## Acceptance Criteria
- Reviewers can triage, annotate, and approve/reject snapshot changes efficiently
- Baseline updates are governed, auditable, and linked to CI/PR context
- UI scales to large snapshot suites with responsive diff interactions
- Permissions and notifications integrate correctly

## PR Guide
- Branch: `issue/077-frontend-visual-snapshot-review`
- Phase 1: artifact ingestion/index + queue/dashboard
- Phase 2: diff viewer modes + annotations/classification
- Phase 3: approval/baseline governance + CI/PR links
- Phase 4: performance, a11y, permissions/audit, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
