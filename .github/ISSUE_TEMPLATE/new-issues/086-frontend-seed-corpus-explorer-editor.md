---
name: "Frontend: Seed & Corpus Explorer/Editor - High-Scale Browsing, Mutation Inspection, and Curated Corpus Management"
description: "Create a powerful seed and corpus management UI for browsing, filtering, inspecting, editing, and curating fuzz inputs with lineage, minimization results, and quality signals"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Seeds/corpus quality drives fuzzing outcomes, but current tooling lacks a rich frontend for understanding and managing inputs at scale:
- Hard to browse large corpora, inspect payload structure, and understand mutation lineage
- No unified view of seed provenance (source, generation strategy, coverage/crash yield)
- Manual curation (promote, quarantine, dedupe, minimize) is slow and error-prone
- Difficult to compare seeds and identify redundant/low-value inputs

## Proposed Solution
Build a **Seed & Corpus Explorer/Editor**:
- Virtualized corpus browser with faceted filters, similarity grouping, and quality metrics
- Seed inspector with decoded payload views, mutation history, and lineage graph
- Safe editing/synthesis workflows for derived seeds and fixture candidates
- Bulk curation actions (tag, quarantine, promote, minimize, dedupe) with auditability

## Requirements
### Functional
- [ ] Corpus list/grid views with filters (source, strategy, target, yield, age, status, tags)
- [ ] Seed detail: raw/decoded payload, metadata, lineage, associated runs/crashes/coverage (#073/#068)
- [ ] Mutation timeline and parent/child lineage visualization
- [ ] Curation actions: promote to golden corpus, quarantine, tag, dedupe suggestions, request minimization
- [ ] Bulk operations with preflight/undo where safe (#051)
- [ ] Import/export corpus subsets and shareable selections (#043/#053)
- [ ] Integration with campaign designer/launch inputs (#085/#074)

### Non-Functional
- [ ] Handle 100k+ seeds with server-side query + virtualization
- [ ] Deterministic ordering and reproducible exports
- [ ] Permission-aware edit/curation controls and audit logs (#070/#063)
- [ ] Accessible data-dense UI and keyboard workflows

## Files to Modify / Create
```
apps/web/src/features/corpus/
├── CorpusExplorer.tsx
├── SeedInspector.tsx
├── SeedLineageGraph.tsx
├── CurationToolbar.tsx
└── hooks/useCorpus.ts

apps/web/src/app/corpus/page.tsx
apps/web/src/app/api/corpus/seeds/route.ts
apps/web/src/app/api/corpus/curation/route.ts
docs/frontend/seed-corpus-explorer.md
```

## Acceptance Criteria
- Large corpora are navigable with actionable quality/provenance insights
- Users can safely curate and export high-value seed sets
- Lineage and mutation context support debugging and campaign design
- Perf, permissions, and audit requirements satisfied

## PR Guide
- Branch: `issue/086-frontend-seed-corpus-explorer`
- Phase 1: indexed browser + seed inspector
- Phase 2: lineage/mutation views + curation actions
- Phase 3: bulk ops + import/export/integrations
- Phase 4: scale/perf hardening, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
