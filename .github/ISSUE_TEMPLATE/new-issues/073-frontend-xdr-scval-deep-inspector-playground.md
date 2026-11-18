---
name: "Frontend: XDR/ScVal Deep Inspector & Mutation Playground - Schema-Aware Decode, Edit, Diff, and Re-Encode"
description: "Build a high-fidelity XDR/ScVal inspector and playground for Soroban payloads with schema-aware decoding, structural editing, validation, diffing, and safe re-encoding for debugging and reproducer authoring"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Soroban debugging frequently requires understanding complex XDR/ScVal payloads (args, return values, ledger entries, events, auth data). Current JSON/hex previews are insufficient:
- Raw/decoded views are disconnected; users cannot safely navigate nested structures
- No schema-aware decoding tied to contract interfaces or known Soroban types
- No interactive edit/validate/re-encode workflow for hypothesis testing and reproducer crafting
- Comparing payloads across runs requires manual text diffing of large blobs
- Sensitive or malformed payloads need safe rendering and clear validation errors

## Proposed Solution
Implement an **XDR/ScVal Deep Inspector & Playground**:
- Dual-pane decode views (tree/structured form + raw hex/base64/XDR JSON) with synchronized selection
- Type-aware decoding using contract specs/ABIs and heuristic fallbacks
- Editable structured form with validation, canonical re-encoding, and round-trip verification
- Structural diff mode for payload comparison across runs/artifacts
- Export/import snippets for reproducers, fixtures, and issue evidence

## Requirements
### Functional
- [ ] Decode/encode Soroban XDR and ScVal types with nested navigation, search, and path copy
- [ ] Schema-aware rendering when contract spec/ABI metadata is available; graceful unknown-type fallback
- [ ] Structured editor for supported types with constraints, enum/map/vec tooling, and inline validation
- [ ] Round-trip verification (decode→edit→encode→decode) with canonicalization and mismatch warnings
- [ ] Payload diff view (structural + raw) and bookmarkable paths/nodes
- [ ] Safe handling for large/malformed payloads: streaming/virtualized tree, truncation, error boundaries
- [ ] Integration points: run detail, artifact viewer, trace inspector, reproducer builder (#036/#044/#068)
- [ ] Shareable deep links and export formats (JSON, hex, base64, fixture snippets) with redaction (#053)

### Non-Functional
- [ ] Decode/render 5MB payloads without blocking UI (workers/virtualization)
- [ ] Deterministic encoding and diff output for identical inputs
- [ ] No code execution from payload content; strict sanitization and CSP-safe rendering
- [ ] Accessible tree/editor controls and keyboard navigation

## Files to Modify / Create
```
apps/web/src/features/xdr-inspector/
├── XdrScValInspector.tsx
├── panes/
│   ├── TreePane.tsx
│   ├── RawPane.tsx
│   └── DiffPane.tsx
├── editor/
│   ├── SchemaForm.tsx
│   └── validators.ts
├── workers/decodeWorker.ts
└── hooks/useXdrInspector.ts

apps/web/src/lib/xdr/
├── decode.ts
├── encode.ts
├── schema.ts
└── diff.ts
apps/web/src/app/runs/[id]/payloads/page.tsx
docs/frontend/xdr-scval-inspector.md
```

## Acceptance Criteria
- Users can decode, inspect, edit, validate, and re-encode payloads with confidence
- Structural diffs and deep links work across run/artifact contexts
- Large/malformed payloads handled safely and performantly
- Exports integrate with reproducer/issue workflows

## PR Guide
- Branch: `issue/073-frontend-xdr-scval-inspector`
- Phase 1: decode/render/tree + raw sync + worker pipeline
- Phase 2: schema-aware editing/validation/re-encode
- Phase 3: diff/export/integrations
- Phase 4: perf hardening, security/a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
