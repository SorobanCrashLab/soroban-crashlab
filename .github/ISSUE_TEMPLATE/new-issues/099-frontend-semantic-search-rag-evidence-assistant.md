---
name: "Frontend: Semantic Search & Evidence Assistant - Hybrid Retrieval, Citations, and Investigation Copilot UX"
description: "Implement a semantic/hybrid search and evidence assistant UX that retrieves runs, logs, traces, docs, and issues with citations, filters, and investigation-aware workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Keyword search is insufficient for debugging complex failures across heterogeneous artifacts and docs:
- Users struggle to find "similar" crashes, traces, or past fixes expressed differently
- Evidence is scattered across runs, logs, issues, runbooks, and docs without unified retrieval
- Any assistant-like UX must be trustworthy: answers need citations, scope control, and safe actions
- Privacy/permissions and hallucination risk make naive AI UX unacceptable

## Proposed Solution
Build a **Semantic Search & Evidence Assistant** frontend:
- Hybrid retrieval UI (keyword + semantic/vector) across indexed entities and documentation
- Result ranking with filters/facets, similarity clusters, and "related evidence" panels
- Citation-first assistant responses that summarize retrieved results and propose next investigative steps (no autonomous privileged actions)
- Feedback loops for relevance tuning and saved investigation queries

## Requirements
### Functional
- [ ] Unified search box/mode supporting keyword, semantic, and hybrid queries with scope selectors
- [ ] Indexed sources: runs, crashes, traces, logs, artifacts metadata, issues, runbooks, docs (#035/#075/#062/#080/#060)
- [ ] Result UI with snippets, highlights, citations, entity badges, and confidence/relevance signals
- [ ] "Find similar" from crash/trace/log/run context and cluster-aware suggestions (#089/#068)
- [ ] Assistant panel: grounded summaries with inline citations, suggested filters/next steps, and explicit uncertainty
- [ ] Strict guardrails: read-only by default, permission-filtered retrieval, no execution without explicit gated actions (#070/#022)
- [ ] Saved searches/prompts, shareable links, and feedback (relevant/not relevant) (#052/#056)
- [ ] Privacy controls, redaction, and opt-in telemetry for quality evaluation (#025/#063)

### Non-Functional
- [ ] Responsive query UX with progressive results and cancellation
- [ ] Transparent provenance/citation display; never present uncited claims as facts
- [ ] Scales to large corpora with pagination and server-backed retrieval contracts
- [ ] Accessible conversational and results UI (keyboard/screen reader)

## Files to Modify / Create
```
apps/web/src/features/semantic-search/
├── SemanticSearchPage.tsx
├── HybridSearchBar.tsx
├── ResultsWithCitations.tsx
├── SimilarEvidencePanel.tsx
├── AssistantPanel.tsx
└── hooks/useSemanticSearch.ts

apps/web/src/app/search/semantic/page.tsx
apps/web/src/app/api/search/semantic/route.ts
apps/web/src/app/api/search/similar/route.ts
docs/frontend/semantic-search-evidence-assistant.md
```

## Acceptance Criteria
- Users can retrieve relevant cross-artifact evidence via hybrid/semantic queries with citations
- Assistant responses are grounded, permission-safe, and clearly scoped
- Similarity and feedback workflows improve investigation speed
- Privacy, accessibility, and performance requirements satisfied

## PR Guide
- Branch: `issue/099-frontend-semantic-search-evidence-assistant`
- Phase 1: hybrid search UI + retrieval contracts + cited results
- Phase 2: similarity/related evidence + saved/feedback loops
- Phase 3: grounded assistant panel + guardrails
- Phase 4: tuning, privacy/a11y hardening, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
