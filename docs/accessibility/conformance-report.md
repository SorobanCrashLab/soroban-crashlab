# Accessibility Conformance Report — Soroban CrashLab Web

## Summary
- Date: 2026-10-19
- Baseline: WCAG 2.2 AA (axe tags: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa)
- Scope: campaigns timeline (#1874), virtualized runs table (#1875), five audited flows (landing→runs, run detail triage, replay, schedule config, settings/keys), form error association (W5-H09).
- Status: Core keyboard and screen-reader contracts implemented; axe gate starts with empty moderate allow-list.

## New modules
- `src/lib/a11y/announcer.ts`: normalized messages, dedupe window (1500ms), monotonic ids, bounded history.
- `src/components/a11y/ScreenReaderAnnouncer.tsx`, `RouteAnnouncer.tsx`: two persistent live regions (polite + assertive); route changes announce and focus `#main-content` when focus was on body.
- `src/lib/a11y/contrast.ts`: measured contrast + `STATUS_COLOR_TOKENS` (text ≥4.5:1, border ≥3:1), distinct non-colour symbols; `RegressionStatusBadge` uses tokens.
- `src/lib/a11y/form-errors.ts`: `getFieldA11yProps` gives stable `aria-invalid`, `aria-describedby`, `aria-errormessage`; `TextField`/`Select` use it.
- `src/app/runs/[id]/run-stream-announcement.ts`: RUN_STATUS/STATIC changes (with previous-status guard), LAGGING (pluralised), connection transitions; `RunDetailAutoRefresh` announces them.

## Feature highlights
- Campaigns timeline: `role="slider"`, `aria-valuemin/max/now/valuetext`, `aria-orientation="horizontal"`, keyboard (←/→, Shift, PageUp/Down ±10 buckets, Home/End, +/−/0), live pause-on-interaction, labelled markers/failure lanes, failure→bucket + run links.
- Runs table: `role="grid"`, `aria-rowcount={displayTotal}`, `aria-multiselectable`, `aria-colindex`/`aria-rowindex`, sortable headers `aria-sort`, header/body split preserves selectors (no `role="presentation"` on header), grid keyboard nav via `use-data-table-keyboard-nav`.

## Five flows audit
| Flow | Focus/keyboard | SR announcements | Tables | Errors | Contrast |
|---|---|---|---|---|---|
| landing → runs | Skip link; nav keyboardable; list links focusable. | Runs list sr-only "N results". | Grid semantics. | — | Badges use measured tokens. |
| run detail triage | Triage actions focusable, visible focus. | Status/LAGGING/connection via stream announcer. | Artifacts headers present; row actions labelled. | Shared error props. | Status uses tokens. |
| replay | h1, skip link, controls keyboardable. | Static view; no auto-stream. | Tables labelled/scoped where present. | TextField/Select errors. | — |
| schedule config | Labels, validation associated. | CRUD could add confirmations (future). | Schedules/history headers present. | Cron/name use `aria-errormessage`. | Tokens where shown. |
| settings/keys | API config + tokens: labels/required/errors. | Toasts provide transient feedback. | Keys table headers. | Error props. | — |

## Known limitations
- Toasts: audit `role="status"`/`role="alert"` and assertive/polite for error/success (target 2026-11-01).
- Axe: moderate allow-list empty; any moderate requires expiry + issue; nightly runs catch regressions.
- Decorative SVGs: landing decorative SVGs must be `aria-hidden="true"` (e2e enforces).
- Header/body grid split is a documented implementation detail (body rows 1..N, no header row counted).

## E2e references
- `e2e/a11y/core-flows.spec.ts`, `e2e/a11y/a11y-config.spec.ts` (axe + config guardrails), `e2e/a11y/keyboard-triage.spec.ts` (keyboard triage). CI runs these in the a11y gate.
