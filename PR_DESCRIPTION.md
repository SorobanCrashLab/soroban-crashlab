# feat: Add live run progress timeline

Closes #499

## Summary

Implements a deterministic live run progress timeline for the dashboard that incrementally streams campaign milestone and failure discovery events from shared `FuzzingRun` data, with explicit loading/error states, pause/resume markers, and responsive/keyboard-accessible controls.

## What changed

### `apps/web/src/app/campaign-milestone-timeline-55.tsx`

- Replaced random simulated timeline generation with run-driven incremental updates.
- Added explicit `dataState` handling (`loading`, `error`, `success`) with dedicated UI states.
- Added retry wiring for timeline stream failures.
- Added pause/resume marker insertion in the event feed.
- Added `aria-live` event log semantics and `aria-pressed` control states for accessibility.
- Preserved responsive layout behavior for controls and event summary row.

### `apps/web/src/app/campaign-milestone-timeline-utils.ts` (new)

- Added pure utility layer for deterministic, testable timeline behavior:
  - `sortRunsForTimeline(runs)`
  - `buildCampaignLifecycleEvent(campaignId, type)`
  - `buildRunProgressEvent(run, knownSignatures)`
  - `selectNextUnseenRun(runs, seenRunIds)`
  - `prependCappedEvent(events, event, maxEventsDisplayed)`
- Added shared `MilestoneEvent` / `MilestoneEventType` contracts for module coordination.

### `apps/web/src/app/page.tsx`

- Wired `CampaignMilestoneTimeline` to dashboard state contracts:
  - `runs={runs}`
  - `dataState={dataState}`
  - `onRetry={() => setFetchAttempt((n) => n + 1)}`
  - explicit timeline `errorMessage`

### `apps/web/src/app/campaign-milestone-timeline-utils.test.ts` (new)

- Added unit tests for:
  - run sorting order
  - failure event mapping and re-observed signature behavior
  - unseen-run incremental selection
  - capped prepend behavior
- Added integration/regression path that validates replay placeholder runs map into timeline `run_update` events.

### `apps/web/src/app/page.integration.test.ts`

- Added cross-module regression coverage for issue #499:
  - deterministic unseen-run progression
  - replay placeholder (`replay-ui-utils`) → timeline event mapping

## Design note

**Tradeoff**: Timeline updates are generated from existing in-memory run data and emitted incrementally at a configurable interval instead of opening a backend stream in this issue.

**Alternative considered**: Introduce websocket/SSE-backed timeline transport now. Deferred to follow-up to keep issue scope focused on UI behavior and shared type integration.

**Rollback path**: Revert this commit to restore previous timeline rendering behavior and remove utility-based event generation.

## Validation

```bash
cd apps/web && npx jest src/app/campaign-milestone-timeline-utils.test.ts src/app/page.integration.test.ts --no-cache
```

- ✅ 28/28 tests passing

```bash
cd apps/web && npm run lint
```

- ⚠ Fails due to pre-existing unrelated baseline issues (e.g. `integrate-sentry-integration-for-crash-reporting.tsx` and pre-existing `page.tsx` memoization dependency warning)

```bash
cd apps/web && npm run build
```

- ⚠ Fails due to pre-existing unrelated baseline TypeScript error in `add-accessible-keyboard-nav-blueprint-page-49.tsx:253` (`handleReset` not defined)

## Checklist

- [x] Timeline updates incrementally and supports pause/resume markers
- [x] Explicit loading/error timeline states implemented with retry affordance
- [x] Keyboard accessibility preserved for timeline controls and event feed focus
- [x] Responsive behavior preserved for controls and event metadata layout
- [x] Unit tests added for primary utility logic and edge behavior
- [x] Integration/regression coverage added for cross-module replay-to-timeline flow
- [x] Existing behavior outside issue scope preserved
