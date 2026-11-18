---
name: "Frontend: Structured Log Query Engine UI - DSL Filters, Facets, Live Tail, and Cross-Run Correlation"
description: "Build an advanced structured log exploration UI with query DSL, field facets, saved queries, live tailing, and correlation across runs, traces, and incidents for high-volume debugging"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement
Logs are critical for diagnosing fuzzing failures and platform issues, but current log views are not optimized for scale or investigation workflows:
- Limited filtering/search; no expressive query language for structured fields
- Difficult to pivot across time, severity, component, run/campaign, and trace IDs
- Live tailing and historical search behave inconsistently; context around matches is hard to inspect
- No correlation from log events to traces, state changes, alerts, or incidents
- Large log volumes degrade performance and usability

## Proposed Solution
Implement a **Structured Log Query Engine UI**:
- Query bar with DSL/autocomplete (field operators, ranges, wildcards, boolean logic)
- Faceted filters, histograms, and field explorer for rapid narrowing
- Virtualized log stream with context expansion, pinning, and match navigation
- Live tail with backpressure controls and pause-on-inspect
- Saved queries, shareable links, and correlation jump-links to related entities

## Requirements
### Functional
- [ ] Query DSL parser/editor with syntax highlighting, validation, autocomplete, and examples
- [ ] Field facets (level, source, contract, run_id, campaign_id, trace_id, error_code) and time histogram brushing
- [ ] High-performance log list: virtualized rows, wrap/pretty-print JSON, expandable context, copy/export
- [ ] Live tail mode with rate indicators, sampling/drop notices, and "show around now" anchoring
- [ ] Correlation actions: open trace span/node, run detail, incident, artifact, or state snapshot (#068/#072/#066)
- [ ] Saved/shared queries, recent history, and URL-synced state (#052/#056)
- [ ] Redaction-aware rendering and permission checks for sensitive log fields (#022/#070)
- [ ] Export selected results/queries (JSON/NDJSON/CSV) with metadata

### Non-Functional
- [ ] Smooth interaction on 1M+ log events via windowing and server-side pagination/cursors
- [ ] Query execution feedback <300ms perceived for indexed/common filters (with progressive results)
- [ ] Deterministic query serialization and share links
- [ ] Accessible controls, keyboard shortcuts, and screen-reader-friendly result summaries

## Files to Modify / Create
```
apps/web/src/features/logs/query-engine/
├── LogQueryWorkbench.tsx
├── QueryBar.tsx
├── dsl/
│   ├── parser.ts
│   ├── autocomplete.ts
│   └── serializer.ts
├── facets/LogFacetsPanel.tsx
├── stream/VirtualizedLogStream.tsx
└── hooks/useLogQuery.ts

apps/web/src/app/logs/page.tsx
apps/web/src/app/api/logs/search/route.ts
apps/web/src/app/api/logs/tail/route.ts
apps/web/src/lib/logs/
├── client.ts
├── correlation.ts
└── redaction.ts
docs/frontend/log-query-engine.md
```

## Acceptance Criteria
- Users can express complex log queries, narrow quickly with facets, and inspect matches in context
- Live tail and historical search are performant and integrated with trace/run/incident workflows
- Saved/shareable queries restore exact state; exports and redaction behave correctly
- Accessibility and permission constraints enforced across views

## PR Guide
- Branch: `issue/075-frontend-structured-log-query-engine`
- Phase 1: DSL/query model + search API integration + virtualized list
- Phase 2: facets/histograms + live tail + correlation links
- Phase 3: saved queries/sharing/export + redaction/permissions
- Phase 4: perf tuning, a11y, tests/docs

**Estimated effort:** 6-8 weeks (200 pts)
