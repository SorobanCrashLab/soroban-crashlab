---
name: "Frontend: Secure Artifact Preview Sandbox - Safe Multi-Format Rendering, Redaction, and Forensic Inspection Controls"
description: "Implement a secure, sandboxed artifact preview system for logs, binaries, images, JSON, WASM, and reports with strict isolation, redaction, malware-safe rendering, and forensic tooling"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Artifacts may contain untrusted, sensitive, or large content (logs, crash dumps, binaries, HTML reports). Current preview capabilities risk security, leakage, or poor usability:
- Rendering untrusted artifacts in-app can expose XSS/content injection risks
- Sensitive secrets/PII may appear in previews without consistent redaction
- Large/binary artifacts lack performant, inspectable viewers
- No unified trust model, download safeguards, or audit trail for artifact access

## Proposed Solution
Build a **Secure Artifact Preview Sandbox**:
- Isolated preview runtimes (sandboxed iframes/workers) per content type
- Redaction/masking pipeline and policy-aware reveal controls
- Specialized viewers for text/log/JSON/hex/binary/image/WASM/trace artifacts
- Safe download/scan indicators, integrity metadata, and access auditing

## Requirements
### Functional
- [ ] Content-type detection and routed viewers: text/log, JSON/tree, hex/binary, image, PDF/HTML (sanitized), archive listings
- [ ] Sandboxed rendering with strict CSP, disabled scripts/plugins, and message-passing bridge
- [ ] Redaction engine for secrets/tokens/PII patterns with masked previews and authorized reveal flows (#025/#070)
- [ ] Forensic helpers: search, line numbers, byte offsets, checksums, metadata, encoding detection (#075/#044)
- [ ] Large file handling: streaming, range requests, virtualization, and sampling previews
- [ ] Trust/safety indicators: scan status, provenance, integrity hash, quarantine state (#023/#065)
- [ ] Download/copy controls with warnings, policy checks, and audit logging (#063)
- [ ] Embeddable preview blocks for reports/whiteboards with same sandbox guarantees (#092/#103)

### Non-Functional
- [ ] Zero script execution from untrusted artifact content; defense-in-depth isolation
- [ ] High performance on large files without freezing UI (workers/streaming)
- [ ] Deterministic redaction behavior and configurable policies per workspace
- [ ] Accessible viewers and keyboard navigation across formats

## Files to Modify / Create
```
apps/web/src/features/artifact-preview/
├── ArtifactPreviewSandbox.tsx
├── viewers/
│   ├── TextLogViewer.tsx
│   ├── JsonTreeViewer.tsx
│   ├── HexViewer.tsx
│   ├── ImageViewer.tsx
│   └── SanitizedDocViewer.tsx
├── sandbox/
│   ├── iframeHost.ts
│   └── policy.ts
├── redaction/
└── hooks/useArtifactPreview.ts

apps/web/src/app/artifacts/[id]/preview/page.tsx
apps/web/src/app/api/artifacts/[id]/preview/route.ts
docs/frontend/secure-artifact-preview-sandbox.md
```

## Acceptance Criteria
- Untrusted artifacts render safely in isolated sandboxes with correct redaction
- Users can inspect large/multi-format artifacts efficiently with forensic tools
- Access/download actions are policy-controlled and auditable

## PR Guide
- Branch: `issue/117-frontend-secure-artifact-preview-sandbox`
- Phase 1: sandbox framework + core viewers + content detection
- Phase 2: redaction/policy + large-file streaming
- Phase 3: trust indicators, embeds, audit/download controls
- Phase 4: security hardening, perf/a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
