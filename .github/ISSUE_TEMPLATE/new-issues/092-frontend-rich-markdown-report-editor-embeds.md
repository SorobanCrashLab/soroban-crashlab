---
name: "Frontend: Rich Markdown & Technical Report Editor - Embeds, Diagrams, Evidence Blocks, and Collaborative Authoring"
description: "Build a powerful technical report editor for postmortems, triage summaries, and run analyses with rich markdown, embedded evidence, Mermaid/diagrams, templates, and collaborative editing"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Users need to produce high-quality incident reports, triage writeups, and reproducibility narratives, but current text inputs are basic and disconnected from evidence.
- No rich editor for structured technical documents with code, tables, diagrams, and embeds
- Cannot embed live/pinned references to runs, traces, logs, charts, or artifacts
- Templates for postmortems/RCAs/regression reports are inconsistent
- Export/share fidelity and collaboration are limited

## Proposed Solution
Implement a **Rich Technical Report Editor**:
- Markdown-first editor with WYSIWYG assists, slash commands, and template blocks
- Evidence embed blocks (run cards, trace snapshots, log excerpts, charts, diff summaries)
- Diagram support (Mermaid), callouts, checklists, and structured metadata sections
- Collaborative editing/commenting hooks, version history, and export pipelines

## Requirements
### Functional
- [ ] Editor with markdown source/preview, formatting toolbar, slash commands, tables, code blocks
- [ ] Embed blocks for entities: runs, crashes, traces, logs, state diffs, charts, artifacts (#036/#068/#072/#075/#081)
- [ ] Template system for postmortems, triage summaries, regression reports, campaign retrospectives (#066/#061/#019)
- [ ] Version history, autosave drafts, restore/compare revisions (#057)
- [ ] Mention/collaboration hooks and inline comments integration (#069/#041)
- [ ] Export to Markdown/PDF/HTML with resolved embeds/snapshots and redaction (#043/#053)
- [ ] Secure sanitization of rendered content and embedded previews

### Non-Functional
- [ ] Smooth editing for large documents (10k+ words, many embeds) with virtualization/lazy embed loading
- [ ] Deterministic serialization for diff/versioning
- [ ] Accessible editor controls, keyboard shortcuts, and screen-reader compatibility
- [ ] Offline draft resilience for PWA contexts (#039)

## Files to Modify / Create
```
apps/web/src/features/reports/editor/
├── TechnicalReportEditor.tsx
├── blocks/
│   ├── EvidenceEmbed.tsx
│   ├── MermaidBlock.tsx
│   └── CalloutBlock.tsx
├── templates/
├── history/
└── hooks/useReportEditor.ts

apps/web/src/app/reports/[id]/edit/page.tsx
apps/web/src/app/api/reports/route.ts
docs/frontend/rich-report-editor.md
```

## Acceptance Criteria
- Users can author high-fidelity technical reports with embedded evidence and diagrams
- Templates, versioning, and exports produce consistent, shareable outputs
- Security, performance, and accessibility requirements met

## PR Guide
- Branch: `issue/092-frontend-rich-report-editor`
- Phase 1: editor core + markdown/blocks + templates
- Phase 2: evidence embeds + entity resolvers
- Phase 3: collaboration/versioning/export
- Phase 4: sanitization, perf/a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
