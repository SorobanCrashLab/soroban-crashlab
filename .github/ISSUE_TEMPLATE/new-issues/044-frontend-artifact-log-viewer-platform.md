---
name: "Frontend: Artifact & Log Viewer Platform - High-Performance Preview, Diff, Search & Safe Rendering"
description: "Build a unified, high-performance artifact and log viewer supporting large files, rich previews, in-view search, diffing, annotations, and secure rendering across formats"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Artifact and log viewing is limited and inconsistent (`ArtifactPreviewModal.md`, log viewer utilities/pages, hex/json/text previews):
- Poor performance on large logs/artifacts
- Limited format support (jsonl, wasm traces, binary/hex, structured logs)
- No in-viewer search, filtering, or jump-to-crash-line
- No side-by-side diff or version comparison
- Security concerns around rendering untrusted content

## Proposed Solution

Create a **Unified Viewer Platform**:
- Virtualized log/artifact rendering for very large files
- Pluggable preview renderers (text, JSON, JSONL, hex, markdown, media, trace)
- In-viewer search/filter, timestamps, severity filters, and deep links to lines/ranges
- Diff mode and annotation hooks; safe sandboxed rendering for untrusted content

## Requirements

### Functional
- [ ] Unified viewer component used in run workspace, artifacts pages, and modals
- [ ] Virtualized rendering for multi-MB/GB-scale logs (chunked loading)
- [ ] Preview renderers: plain text, JSON tree, JSONL table, hex/binary, markdown, trace timeline
- [ ] Search within file (regex/literal), filters (severity/time/source), jump-to-offset/line
- [ ] Diff mode: compare two artifacts/logs or versions
- [ ] Deep-linkable line/range selections and copy/share
- [ ] Download/raw view toggle and metadata panel (size, hash, type, provenance)

### Non-Functional
- [ ] Open 50MB log with first paint < 1s (chunked/virtualized)
- [ ] Scroll/search remains responsive (no main-thread freeze)
- [ ] Safe rendering: sanitize/escape untrusted content, no script execution
- [ ] Accessible keyboard navigation and screen reader labels

## Files to Modify / Create
```
apps/web/src/features/viewer/
├── UnifiedViewer.tsx
├── ViewerShell.tsx
├── renderers/
│   ├── TextRenderer.tsx
│   ├── JsonRenderer.tsx
│   ├── JsonlRenderer.tsx
│   ├── HexRenderer.tsx
│   ├── MarkdownRenderer.tsx
│   └── TraceRenderer.tsx
├── search/ViewerSearch.tsx
├── diff/ViewerDiff.tsx
├── virtualization/
└── hooks/useViewer.ts

apps/web/src/components/JsonPreview.tsx (integrate/migrate)
apps/web/src/components/TextPreview.tsx (integrate/migrate)
apps/web/src/components/HexPreview.tsx (integrate/migrate)
apps/web/src/app/logs/ (integrate)
```

## Acceptance Criteria
- Large artifacts/logs viewable without freezing
- Search/filter/diff/deep-linking work across supported formats
- Untrusted content rendered safely
- Viewer reused consistently across app surfaces

## PR Guide
- Branch: `issue/044-frontend-artifact-log-viewer`
- Phase 1: Viewer shell + virtualization + text/json
- Phase 2: JSONL/hex/markdown/trace renderers
- Phase 3: Search/filter/diff/deep links
- Phase 4: Security hardening, a11y, integration

**Estimated effort:** 5-6 weeks (200 pts)