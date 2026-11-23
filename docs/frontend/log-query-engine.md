# Structured Log Query Engine

Tracks issue #075. Replaces the flat `/logs` viewer with a query-oriented investigation surface: DSL search, facets, histogram brushing, virtualized stream, live tail, correlation links, saved/shareable queries, redaction and export.

## User workflow

1. Type a DSL query in the query bar (fields, ranges, wildcards, boolean logic). Completions and validation appear inline.
2. Narrow with facets (level, source, contract, run/campaign/trace, error code) or sweep the histogram to brush a time window.
3. Inspect a row to open its context, correlated entities and raw JSON. Pin rows to collect correlation jump-links.
4. Switch to live tail for streaming events; pause on inspect, adjust sampling, and watch rate/backpressure notices.
5. Save the query, copy a shareable link, or export the current result set as JSON, NDJSON or CSV.

## Query DSL

| Example | Meaning |
| --- | --- |
| `level:error` | equality on a known facet |
| `source:fuzz-*` | wildcard match |
| `message:"RPC timeout"` | quoted phrase |
| `latency:>=800` | numeric comparison on a structured attribute |
| `timestamp:[<iso-from> TO <iso-to>]` | inclusive range (`{}` is exclusive) |
| `run_id:run-1042 AND NOT message:flake` | boolean logic and negation |
| `(run_id:r-1 OR run_id:r-2) AND level:error` | grouping |

An empty query matches all events. Free text searches message, source, structured facets and attributes. Serialization is deterministic: `serializeNode` sorts boolean children and normalizes values, so equivalent queries produce the same share token.

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/logs/query-engine/dsl/parser.ts` | tokenizer, AST, diagnostics |
| `.../dsl/evaluate.ts` | AST evaluator and index hints |
| `.../dsl/autocomplete.ts` | completions and highlight spans |
| `.../dsl/serializer.ts` | canonical query + URL state codec |
| `.../facets/LogFacetsPanel.tsx` | facets, histogram brush, field explorer |
| `.../stream/VirtualizedLogStream.tsx` | windowed rows, context, pinning, matches |
| `.../hooks/useLogQuery.ts` | search/tail orchestration and state |
| `apps/web/src/lib/logs/client.ts` | fetch transport, saved queries, export |
| `apps/web/src/lib/logs/redaction.ts` | field masking and permission policy |
| `apps/web/src/lib/logs/correlation.ts` | jump-links to run, trace, incident, artifact, state |
| `apps/web/src/app/api/logs/search/route.ts` | facets, histogram, cursor pagination |
| `apps/web/src/app/api/logs/tail/route.ts` | streaming tail with backpressure notices |

## Performance

The API generates a deterministic 1M+ event corpus index-by-index rather than materializing it. Search scans a bounded window (`MAX_SCAN`) and returns `stats.partial` when a query is too broad; the UI keeps previous results visible while the next request is in flight. Rows are windowed with `computeVirtualWindow`, so DOM size stays bounded regardless of result count. Tail buffers are capped and report dropped events.

## Permissions and redaction

Redaction is enforced server-side before events leave `/api/logs/*`. Sensitive attribute keys (tokens, secrets, credentials, cookies, API keys) and token-like message patterns are masked for viewers. Only maintainer sessions may receive unmasked fields; the client access-level selector is an affordance for testing and never substitutes for server authorization. Redacted events carry `redacted` and `sensitiveFields` metadata so the UI can show a non-spoiling notice.

## Sharing and persistence

`encodeQueryState` produces an opaque `lq1.` token containing the canonical query, time window, facets, sort, mode and histogram brush. The token is written to `?state=` with `history.replaceState`, so reload and share links restore identical state. Saved queries and recent history are local-first (`localStorage`), keyed by a deterministic fingerprint.

## Accessibility

- The query bar is a labeled combobox with an ARIA listbox; diagnostics use `role="alert"`.
- The stream exposes `role="list"`/`listitem`, roving keyboard navigation (↑/↓/Home/End), Enter to inspect and `P` to pin.
- Match navigation, result counts and redaction notices are announced via live regions.
- `/` focuses the query input; `Alt+S` pauses/resumes live tail.

## Tests

`src/features/logs/query-engine/dsl/dsl.test.ts` covers parsing, evaluation, canonical serialization, URL round-trips, faceting/redaction and export helpers.
