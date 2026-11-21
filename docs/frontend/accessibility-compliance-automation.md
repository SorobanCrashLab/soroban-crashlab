# Accessibility Compliance Automation Center

Tracks issue #2335. Route: `/quality/accessibility`.

The center gathers accessibility findings from automated and manual sources in one place.
It deduplicates them, maps them to WCAG 2.2 criteria, tracks remediation, and decides the
accessibility release gate.

## Code

| Path | Purpose |
| --- | --- |
| `apps/web/src/features/a11y-compliance/model.ts` | Pure domain logic: normalisation, fingerprinting/dedupe, scoring, SLA, WCAG catalogue, gate evaluation, report export |
| `apps/web/src/features/a11y-compliance/hooks/useA11yCompliance.ts` | Client data hook + derived aggregates |
| `apps/web/src/features/a11y-compliance/AccessibilityComplianceCenter.tsx` | Tabbed shell (WAI-ARIA tabs pattern) |
| `apps/web/src/features/a11y-compliance/FindingsDashboard.tsx` | Summary, hotspots, high-risk surface coverage, regressions/SLA, 30-day trend |
| `apps/web/src/features/a11y-compliance/RemediationQueue.tsx` | Prioritised queue, lifecycle actions, user barrier report intake |
| `apps/web/src/features/a11y-compliance/WcagCriteriaMap.tsx` | Conformance per criterion grouped by principle, with remediation guidance |
| `apps/web/src/features/a11y-compliance/ReleaseGatePanel.tsx` | Gate status, waiver request/approval, audit log, exports |
| `apps/web/src/app/api/a11y-compliance/findings/route.ts` | Ingestion, query and lifecycle API |
| `apps/web/src/app/quality/accessibility/page.tsx` | Page |

## Sources and normalisation

Accepted `source` values: `axe-ci`, `lint`, `runtime`, `manual-audit`, `user-report`.

Each raw item is normalised as follows:

- **Route**: the origin, query string and hash are removed, and numeric or UUID segments become `[id]`, so `/runs/42/trace` becomes `/runs/[id]/trace`.
- **Impact**: `critical | serious | moderate | minor`. Common aliases are mapped, such as `error`/`high` → `serious` and `warning`/`medium` → `moderate`.
- **Surface**: one of the high-risk surfaces `data-grid`, `chart`, `canvas`, `diff`, `trace`.
- **WCAG criteria**: taken from the input, or inferred from known axe rule ids (for example `color-contrast` → `1.4.3`).

## Deduplication and provenance

`fingerprint = FNV-1a(route | component | ruleId or sorted criteria | selector)`.

When a finding with the same fingerprint arrives again, the existing record is updated rather than duplicated:

- its source, reference and timestamp are added to `provenance`;
- `occurrences` goes up by one;
- the most severe impact seen so far is kept;
- if the finding was `fixed` or `verified`, it is re-opened and flagged as a **regression**.

User barrier reports usually lack selectors and rule ids. They are also correlated with
existing findings that share the same route, component and criteria.

## Priority score (0–100)

The score is the sum of five parts, capped at 100:

- **Impact**: 50 / 35 / 20 / 8 for critical / serious / moderate / minor.
- **WCAG level**: the strictest mapped criterion counts, A = 20, AA = 12, AAA = 4.
- **Reach**: `min(15, 4·log2(1+occurrences))`.
- **High-risk surface**: +5.
- **User-reported**: +10.

The queue order is deterministic: score, then impact, then first seen, then id.

## Lifecycle and SLA

Statuses: `open → triaged → in-progress → fixed → verified`, plus `wont-fix`. A finding can only
be marked `verified` if it is `fixed` and has at least one linked PR (`#123` or a GitHub PR URL).
Every change is written to the audit log.

| Impact | SLA |
| --- | --- |
| critical | 7 days |
| serious | 14 days |
| moderate | 30 days |
| minor | 90 days |

A finding is "at risk" after 75% of its SLA has passed.

## Release gate

The default policy blocks a release when any of these is true:

- there are any unwaived critical or serious findings;
- there are more than 10 unwaived moderate findings;
- there is any unwaived regression.

The gate is **warn** when nothing blocks the release but there are SLA breaches or active waivers.

Waivers are scoped to a release, need a justification, and expire after 30 days by default.
Someone other than the requester must approve them. Expired or rejected waivers do not count.

## API

`GET /api/a11y-compliance/findings?status=open-any&impact=&source=&route=&surface=&criterion=&assignee=&q=&release=`
returns `{ findings, total, waivers, gate, audit, generatedAt }`.

`POST` request bodies:

```jsonc
{ "kind": "findings", "source": "axe-ci", "actor": "ci", "items": [{ "route": "/runs", "component": "RunHistoryTable", "ruleId": "color-contrast", "impact": "serious", "selector": "td.status", "reference": "ci#123" }] }
{ "kind": "barrier-report", "description": "...", "route": "/trends", "component": "TrendChart", "surface": "chart" }
{ "kind": "waiver", "findingIds": ["a11y-0002"], "justification": "...", "release": "v1.4.0", "expiresAt": "2026-12-31T00:00:00Z", "actor": "dev" }
```

`PATCH` request bodies:

```jsonc
{ "kind": "finding", "id": "a11y-0001", "status": "fixed", "assignee": "frontend-core", "linkPr": "#2101", "actor": "dev" }
{ "kind": "waiver", "id": "waiver-0010", "decision": "approved", "actor": "a11y-lead" }
```

Batches are limited to 500 items. Storage is an in-memory, process-local store that is seeded
with sample data. Replace `getStore()` in the route with a persistent backend; the API contract
does not need to change.

## Privacy

User-submitted text is redacted before it is stored. Emails, `token`/`key`/`auth`/`session`/`code`
query values, and digit runs of 9 or more are removed. The text is limited to 2,000 characters.
Waiver justifications get the same redaction.

## Exports

- A VPAT-oriented markdown summary with conformance for each criterion. This is internal and is not a formal conformance claim.
- A 30-day trend snapshot as CSV.
- Gate evidence as JSON, including the waivers.

## Accessibility of the center

- Tabs follow the WAI-ARIA pattern: roving tabindex and arrow/Home/End keys.
- Every table has a caption and `th` scopes.
- Status messages are announced with `role=status`.
- Status is never shown by colour alone; icons and labels are always present.
- The trend chart has a text summary and a data table you can expand.
- Every form field has a visible label.
