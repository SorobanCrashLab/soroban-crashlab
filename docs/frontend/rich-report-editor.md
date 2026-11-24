# Rich Technical Report Editor

Tracks issue #2313. This document describes the working vertical slice in `apps/web`:
a Markdown-first editor, reserved block directives, evidence resolution, templates,
version history, comments, and safe export.

## Status

- [x] Markdown source and sanitized preview with formatting toolbar, slash commands, and keyboard shortcuts
- [x] Evidence, Mermaid, callout, and checklist blocks stored as Markdown directives/task lists
- [x] Templates: postmortem, triage summary, regression report, campaign retrospective
- [x] Local autosave, offline save queue, conflict detection, and version history with restore/compare
- [x] Comments with `@mention` extraction hooks
- [x] Markdown, HTML, and PDF-ready HTML export with redaction
- [x] Pure helper library with colocated Vitest coverage
- [x] `GET`/`POST`/`PATCH /api/reports` with Zod validation and compare-and-swap revisions
- [ ] Server-side persistence beyond the seeded in-memory store
- [ ] Delivery of mention notifications to a real notification service
- [ ] Headless PDF generation service (the export produces print-ready HTML for the browser)

## Route

Open `/reports/[id]/edit`. The route is a thin server component that loads the seeded in-memory report store and renders `TechnicalReportEditor` from `src/features/reports/editor/`.

## Code map

- `apps/web/src/features/reports/editor/TechnicalReportEditor.tsx` — main UI, toolbar, preview, slash commands, side panels, export actions
- `apps/web/src/features/reports/editor/hooks/useReportEditor.ts` — document state, autosave, offline queue, revisions, comments, evidence mode
- `apps/web/src/features/reports/editor/blocks/` — accessible evidence, Mermaid, callout, and checklist block renderers
- `apps/web/src/features/reports/editor/history/` — version list, restore/compare controls, line diff rendering
- `apps/web/src/features/reports/editor/templates/` — deterministic report templates
- `apps/web/src/features/reports/editor/lib/` — pure helpers and colocated tests
- `apps/web/src/app/api/reports/route.ts` — report API
- `apps/web/src/lib/storage/reports-store.ts` — seeded in-memory report store

## Markdown storage model

Markdown remains the source of truth. Rich blocks are fenced code blocks with reserved languages, so a document stays readable and editable without a hidden binary format:

````markdown
```report-evidence
{"entityId":"run-001","id":"ev-1","mode":"live","type":"run"}
```

```report-mermaid
{"caption":"Failure path","code":"flowchart TD\n  A --> B","id":"m1"}
```

```report-callout
{"body":"Check the linked trace.","id":"c1","title":"Careful","variant":"warning"}
```
````

`parseBlocks` splits a document into text and block segments without dropping source text; `blocksToMarkdown` reassembles it with normalized blank-line boundaries. `replaceBlockData` updates a single directive by id and leaves surrounding Markdown untouched. Payloads are validated with Zod schemas before rendering or export. Invalid and unclosed directives stay visible as explicit error blocks.

Checklists use GFM task lists (`- [ ]` / `- [x]`) so their state is versioned with the Markdown source and toggled through the checklist panel.

## Editing interactions

- **Views:** source and preview tabs. The preview uses `react-markdown` with `remark-gfm`, sanitized Markdown, `safeReportUrl` for every link, and no `dangerouslySetInnerHTML`.
- **Toolbar/shortcuts:** bold, italic, link, inline code (`Ctrl/Cmd+B/I/K/E`) and heading, list, quote, table, code block (`Ctrl/Cmd+Shift+H/L/Q/T/C`).
- **Slash commands:** type `/` on a source line for evidence, Mermaid, callout, table, checklist, or template insertion. Press Enter to run the command or Escape to dismiss the palette.
- **Templates:** replace or append deterministic Markdown. Applying a template is an explicit editor action, not a silent rewrite.
- **Accessibility:** labelled toolbar (`role="toolbar"`), view/sidebar tablists, live status region for announcements, labelled source textarea and preview tabpanel, `role="alert"` for conflicts, and role/aria metadata on block components and the diff view.

## Evidence resolver

`EntityResolver` is an injected abstraction with a seeded in-memory `MockEntityResolver` in this slice. `EvidenceEmbed` resolves live references on demand; pinning stores an immutable `EntitySnapshot` in the reference, and unpinning returns to live resolution. Exports accept a `snapshots` map captured at export time for live references, so an exported report is self-contained. Unsafe source URLs are dropped rather than emitted as links.

## Mermaid and callouts

Mermaid source is treated as untrusted text. `safeMermaidText` strips raw HTML tags and control characters and caps line count; `validateMermaid` checks supported headers, length, interactive directives, balanced quotes, and raw HTML. Invalid diagrams render as an accessible text fallback with a `<pre><code>` source block instead of executing a diagram library. Callouts are validated variants (`info`, `warning`, `success`, `danger`) with plain-text title/body rendering.

## Persistence, revisions, and comments

`useReportEditor` writes versioned drafts to localStorage through the repository's `safeStorage` wrapper. When the browser is offline or a save fails, the mutation is appended to a queued-save list and replayed when connectivity returns. The save status chip exposes `idle`, `saving`, `saved`, `offline`, `queued`, `conflict`, and `error` states.

The server uses compare-and-swap: a `PATCH` must include the current `baseRevision`. Stale or ahead bases return a structured conflict with fingerprints; the UI offers “load remote” or an explicit local overwrite (`force: true`). `allowEmpty` creates a revision without content changes for manual “Save version” actions. Restoring an old revision creates a new revision rather than erasing history, and compare renders a bounded LCS line diff.

Comments are stored on the document with an anchor, author, body, timestamp, resolution flag, and mention list. `tokenizeMentions` extracts `@handle` tokens; delivery to a notification service is not implemented in this slice.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reports?reportId=...` | Load the current document and revision history |
| `POST` | `/api/reports` | Create/seed a document (Zod validated) |
| `PATCH` | `/api/reports` | Save with `baseRevision`, optional `force`, `allowEmpty`, or `restoreRevision` |

All bodies are validated with Zod schemas shared with the client-side model. The in-memory store is a development seam; swapping it for a durable adapter does not change the client contract.

## Export and redaction

`exportReport(document, format, options)` supports `markdown`, `html`, and `pdf-html`. Directives are parsed before redaction so credentials inside JSON payloads cannot corrupt escaped quotes. Evidence snapshots, callout fields, diagram captions, and ordinary text blocks are redacted independently; `[REDACTED]` markers survive plain-text flattening for labels and titles. Generated HTML is sanitized and uses escaped text with no raw HTML injection. `pdf-html` adds A4 print CSS, page breaks, and print link rules for browser/headless printing.

Serialization is deterministic: newlines are normalized to LF, object keys are sorted, comments and embeds have canonical ordering, and FNV-1a fingerprints detect no-op saves.

## Security and performance notes

- All Markdown passes through `sanitizeReportMarkdown` before preview/export; link URLs are checked by `safeReportUrl`; generated HTML passes through `sanitizeReportHtml`.
- Redaction patterns are deliberately specific (private keys, bearer tokens, secret keys, transaction-style secrets, URL credentials, and common `key=value` secrets) to avoid mangling hashes and stack traces.
- Diffing is bounded: documents above the LCS cell cap fall back to prefix/suffix trimming plus a single replace hunk.
- Mermaid validation caps source length and line count, and embeds resolve lazily only inside evidence blocks.
- Autosave work is debounced and keyed per report; large reports keep the Markdown in a single textarea instead of mounting an editor per block.

## Tests

Run the focused suite from `apps/web`:

```bash
node node_modules/vitest/vitest.mjs run src/features/reports --passWithNoTests
```

The suite covers serialization/fingerprints, block parsing, redaction, sanitization, Mermaid safety, slash commands, formatting, checklists, mentions, evidence refs, revisions/diffs, templates, and export.
