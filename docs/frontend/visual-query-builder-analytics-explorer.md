# Visual Query Builder & Analytics Explorer

Tracks issue #2339. `/analytics/explore` lets you compose cross-entity queries over runs, crashes, logs, traces, metrics and CI without learning a query language. The visual builder and the generated JSON/DSL are views of one model, so they cannot drift apart.

## User workflow

1. Pick a **source** entity, or start from a **template** (failures by area, crash signatures, slow spans, error logs, CI failures, peak coverage).
2. Browse the **schema**: field types, descriptions, sample/enum values and the operators and aggregations each field accepts. Fields marked *restricted* are redacted for non-maintainers.
3. Add blocks to the canvas: **joins** along declared relations, nested **filter groups** (AND/OR/NOT), a **time window**, **columns**, **group by**, **aggregations**, **sort** and **limit**, plus named **parameters**. Every block has keyboard controls. You can also drag fields from the schema browser onto a section, which does the same thing as that section's "add" control.
4. Check the **Query** pane: the read-only SQL-like DSL, the editable canonical JSON (edits are validated and applied back to the canvas), the **explain** plan with cost estimate and performance hints, and the **checks** list (errors block the run, warnings don't).
5. Run the query. You can view the results as a **grid** (cells drill down to runs, campaigns, logs, triage and CI), a **pivot**, a **bar chart** or a **timeline**, and export them as CSV (protected against formula injection) or JSON.
6. **Save** queries (private, or "team" to share), revisit them from **history**, copy a **share link**, or copy an **embed** snippet for a CrashLab dashboard or report.

## Model and determinism

`lib/model.ts` defines the `VisualQuery` tree. Block ids exist only for React keys and focus. `lib/serialize.ts` strips them, sorts keys and set-valued lists (`in`, `not_in`) but not range bounds, and produces canonical JSON plus a 64-bit FNV fingerprint. `parseQueryJson` validates with zod and reassigns ids by traversal order, so `serialize(parse(serialize(q))) === serialize(q)`. A test asserts this for every template.

Share links (`?q=<base64url canonical JSON>`) and saved queries carry the **definition only**, never result data. The recipient always re-runs the query under their own role.

## Execution

`POST /api/query-builder/run` with `{ query, params?, mode?: 'run' | 'explain' }`:

- The server re-parses, re-validates and re-binds parameters using the caller's resolved role. Restricted fields (`crashes.payload`, `ci.author`) cannot be filtered, grouped, sorted or aggregated by non-maintainers, because doing so would leak values one predicate at a time. When projected they are returned as `[REDACTED]`. Inline secrets in any string cell are masked through `lib/redaction`.
- `lib/engine.ts` uses hash joins (left-row order preserved), the time window, the filter tree, grouping (first-seen order), aggregations (`count`, `count_distinct`, `sum`, `avg`, `min`, `max`, `p50`, `p95`), a stable sort with nulls last, and the limit.
- Guardrails: 1,000 result rows, 50,000 scanned rows, 100,000 post-join rows, and 2 s per query. Hitting a bound returns a **partial** result with a warning, not an error.
- Relative windows (`last_24h`, …) end at the **newest value of the window field** in the data, so fixture datasets stay queryable. Custom windows are absolute.

## Adapters

| Entity | Adapter | Source |
| --- | --- | --- |
| `runs`, `crashes` | `adapters/runs.ts` | run storage driver (`selectRunStorageDriver`: in-memory fixtures or KV) |
| `traces`, `metrics` | `adapters/runs.ts` | derived deterministically from each run's timing and corpus stats until a trace/metrics backend exists |
| `logs` | `adapters/logs.ts` | log corpus (#075), latest 5,000 events |
| `ci` | `adapters/ci.ts` | CI provider (#2314): mock snapshot by default, GitHub Actions when configured |

Adding a dataset means adding one entry to `lib/schema.ts` (fields and relations) and one `DatasetAdapter`. If an adapter fails, that entity has zero rows and the result carries a warning.

## Embeds

`/analytics/explore?q=…&embed=1&view=chart|grid|pivot|timeline` renders only the result widget and runs on load. The app sends `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'`, so embeds work inside CrashLab pages, not on third-party sites.

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/query-builder/lib/schema.ts` | entities, fields, relations, operator and aggregation compatibility |
| `.../lib/model.ts` | query tree and pure editing helpers |
| `.../lib/validate.ts` | role-aware validation and parameter binding |
| `.../lib/serialize.ts` | canonical JSON, fingerprint, DSL rendering, share tokens |
| `.../lib/engine.ts` | execution, guardrails, redaction |
| `.../lib/explain.ts` | plan, cost estimate, hints |
| `.../lib/results.ts` | pivot, chart, timeline, exports, drill-down links |
| `.../lib/templates.ts`, `lib/saved.ts` | templates; saved queries and history (`safeStorage`) |
| `.../adapters/` | dataset adapters (server-only) |
| `.../VisualQueryBuilder.tsx`, `SchemaBrowser.tsx`, `QueryCanvas.tsx`, `QueryPreview.tsx`, `ResultExplorer.tsx` | UI |
| `.../hooks/useVisualQuery.ts` | state, derivations, execution |
| `apps/web/src/app/api/query-builder/run/route.ts` | API |

## Accessibility

All composition is done with native form controls. Drag-and-drop is optional. List items reorder with ↑/↓ buttons, tabs follow the WAI-ARIA tabs pattern, validation issues are rendered next to the block that caused them, and charts expose an accessible label alongside the grid and pivot tables.

## Known gaps

- Saved queries persist per browser (`safeStorage`). "Team" visibility is a label carried in share links; server-side shared libraries with ACLs are follow-up work.
- Traces and metrics are derived from runs until dedicated backends exist (see the adapters table).
- The DSL is generated output only. Two-way text editing goes through the canonical JSON.

## Tests

`apps/web/src/features/query-builder/lib/query-builder.test.ts` (schema, parity, validation, engine, guardrails, explain, transforms, persistence) and `apps/web/src/app/api/query-builder/run/route.test.ts` (role-aware execution, redaction, parameters, explain mode, catalog registration).
