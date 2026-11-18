---
name: "Frontend: Mermaid & Architecture Diagramming Studio - Live System Diagrams, Incident Flows, and Evidence-Annotated Visual Models"
description: "Provide an in-app Mermaid/diagramming studio for architecture, sequence, state, and incident-flow diagrams with live validation, evidence annotations, versioning, and embed/share workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Engineers frequently need sequence diagrams, state machines, and architecture views to explain crashes, contract interactions, and incident flows. External tools break context and drift from reality:
- No native diagram authoring tied to runs, traces, and system topology
- Mermaid snippets in docs/reports lack validation, preview parity, and reusable components
- Incident/triage diagrams cannot be annotated with evidence or kept versioned
- Sharing/exporting diagrams with consistent rendering is unreliable

## Proposed Solution
Build a **Diagramming Studio** integrated with CrashLab entities:
- Mermaid editor with live preview, linting, autocomplete snippets, and theme-aware rendering
- Visual helpers for sequence/state/flowchart/ER diagrams and topology import templates
- Evidence annotations linking diagram nodes/steps to runs, traces, logs, and issues
- Version history, diff, embed in reports/runbooks/help, and export (SVG/PNG/PDF)

## Requirements
### Functional
- [ ] Split editor/preview with syntax validation, diagnostics, and recoverable render errors
- [ ] Diagram templates: contract call sequence, failure flow, incident timeline, architecture, state transition
- [ ] Node/edge annotation links to platform entities and external references (#036/#068/#062/#066)
- [ ] Import assists from trace/call graph/topology data to bootstrap diagrams (#068/#082/#098)
- [ ] Versioning, compare/diff, restore, and share permissions (#056/#052/#070)
- [ ] Embed diagrams in technical reports, runbooks, docs, and whiteboards (#092/#080/#103)
- [ ] Export SVG/PNG/PDF/Markdown with deterministic rendering and theme support (#046)
- [ ] Safe rendering sandbox for untrusted diagram content and strict sanitization

### Non-Functional
- [ ] Sub-200ms preview updates for typical diagrams; debounced rendering for large graphs
- [ ] Consistent rendering across browsers/themes and exported artifacts
- [ ] Accessible editor controls, keyboard shortcuts, and text alternatives for diagrams (#038/#094)
- [ ] Audit logging for shared/public diagram artifacts when applicable (#063/#053)

## Files to Modify / Create
```
apps/web/src/features/diagrams/
├── DiagramStudio.tsx
├── MermaidEditor.tsx
├── DiagramPreview.tsx
├── annotations/
├── templates/
├── exporters/
└── hooks/useDiagrams.ts

apps/web/src/app/diagrams/[id]/page.tsx
apps/web/src/app/api/diagrams/route.ts
docs/frontend/diagramming-studio.md
```

## Acceptance Criteria
- Users can author, validate, annotate, version, and share diagrams in-context
- Diagrams can be generated/seeded from system data and embedded in reports/runbooks
- Rendering/export is deterministic, secure, and accessible

## PR Guide
- Branch: `issue/104-frontend-mermaid-diagramming-studio`
- Phase 1: editor/preview/validation + persistence
- Phase 2: annotations/templates + data import assists
- Phase 3: versioning/embed/export integrations
- Phase 4: security/a11y/perf tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
