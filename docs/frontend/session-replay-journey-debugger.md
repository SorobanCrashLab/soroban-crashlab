# Session Replay & Journey Debugger

Tracks issue #2341. This feature captures privacy-aware session replays of the web app and plays them back with timeline, network, error and journey context, so frontend issues can be reproduced from the replay instead of from screenshots.

- `/support/session-replay`: sessions, journey funnels and top paths, this browser's consent and developer-mode controls, and local bundle import.
- `/support/session-replay/[id]`: the player, timeline and transcript, network panel, errors and context. Also handles share links (`?share=`).

## What is captured

Structured UI events rather than DOM snapshots: route changes, clicks and submits (element descriptors: tag, id, test id, role, short masked label), input *lengths*, scroll, resize, visibility, network method / redacted URL / status / timing / `x-request-id` / `traceparent`, console warnings and errors, uncaught errors and rejections, web vitals (`lib/perf/vitals`), feature flags (`lib/flags`), and app-provided marks and state summaries (`replayAnnotate`). This keeps payloads small, survives SPA re-renders, and keeps redaction tractable.

**Never captured:** input values (unless the field opts in with `data-replay-allow` and is not denied), request or response bodies or headers (other than the two correlation headers), cookies, storage contents, or markup.

## Privacy and consent

Capture runs only when all of the following hold (`privacy/consent.ts`, `decideCapture`):

1. `NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY=on`, or this browser enabled developer mode;
2. the user explicitly allowed replay (the default is *not asked*, which means no capture);
3. no Global Privacy Control or Do-Not-Track signal;
4. the route is not excluded (`/support/session-replay`, `/settings/tokens`);
5. the session is sampled in (`NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY_SAMPLE_RATE`, deterministic per session id). Developer mode always records, but locally only.

Withdrawing consent stops capture immediately.

Redaction (`capture/redaction.ts`) is deny-first:

- Deny selectors (`input[type=password]`, `[data-sensitive]`, `[data-replay-block]`, credential `autocomplete` fields) contribute no label at all.
- Kept text passes through `lib/redaction` plus PII patterns: emails, card-like numbers, Stellar secret seeds, JWTs, and `token=` / `session=` / `code=` pairs.
- URLs lose their fragment and the values of sensitive query parameters.

**The server re-validates and re-scrubs every batch**, so an old or modified client cannot bypass the rules.

## Overhead

When replay is off, `SessionReplayBootstrap` (mounted in the root layout next to `SentryClientBootstrap`) does a single storage read and nothing else. The capture host is a dynamic import that never downloads. When on, listeners are passive and capture-phase, scroll and resize are throttled (250 ms), the buffer is bounded (5,000 events, with overflow counted), batches go out every 5 s or 200 events with bounded retry and backoff, and the remainder is flushed with `sendBeacon` when the page hides. History, fetch and console wrappers are restored exactly on stop.

## Storage, retention and access

- Sessions are **encrypted at rest** (AES-256-GCM, key derived from `CRASHLAB_SESSION_REPLAY_KEY`; a random per-process key is used if it's unset).
- Captured sessions are kept `CRASHLAB_SESSION_REPLAY_RETENTION_DAYS` (default 14) and pruned on every access. At most 500 are kept, with oldest-first eviction.
- Viewing a captured session requires signing in, or a **share link**: an HMAC-signed, session-bound token valid from 5 minutes to 7 days, mintable by maintainers only. Missing and forbidden sessions both return `404`, so ids cannot be enumerated.
- Views, exports and share-link creation are written to the audit log (`replay.view`, `replay.export`, `replay.share`).
- Demo sessions (synthetic, no user data) are viewable by everyone so the player works on a fresh install.

## Player

- Play/pause, speeds from 0.5× to 8×, a scrubber with severity-coloured markers and idle gaps, and previous/next event.
- **Breakpoints** pause exactly at errors, failed or slow requests, navigation, or poor vitals. **Skip idle gaps** jumps over quiet periods, and gaps are shown as such rather than as a frozen screen.
- Keyboard: <kbd>Space</kbd>/<kbd>K</kbd> play–pause, <kbd>←</kbd>/<kbd>→</kbd> ±5 s, <kbd>Shift</kbd>+arrows to the previous/next marker. Errors are announced in a polite live region while playing.
- The transcript tab lists key events as text, which is the accessible way to read a replay.
- Correlation: request ids link to `/logs` searches and trace ids to trace log queries (#014/#075). Each error shows the failed request most likely behind it (one that failed within 2 s before). Incidents and issues can be linked to a session (#066).

## Journeys

`lib/journey.ts` computes ordered funnels for triage, campaign setup and run investigation (route and action steps, with entity ids normalised to `:id`), plus top route paths, over the sessions visible to the caller (#078).

## Bundles

**Export bundle** downloads a versioned (`crashlab.replay-bundle/v1`), re-scrubbed JSON file with a checksum. **Bug report** downloads a Markdown summary covering errors with correlated request ids, failed requests and the transcript. In developer mode, **Export this tab's recording** bundles the in-memory capture without uploading anything. Imported bundles are validated, re-scrubbed and replayed locally, and a checksum mismatch is flagged.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/session-replay` | Session summaries (captured ones only for signed-in users) |
| `GET /api/session-replay?view=journeys` | Funnels and paths |
| `GET /api/session-replay?id=[&share=][&format=bundle]` | One session, or its bundle |
| `POST /api/session-replay` | `ingest` (batches; duplicate sequence numbers ignored), `share` (maintainer), `link` (signed-in) |

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/session-replay/capture/schema.ts` | event and session schema, limits |
| `.../capture/redaction.ts` | masking and URL redaction |
| `.../capture/recorder.ts` | recorder with injectable environment |
| `.../capture/transport.ts` | batching, retry, beacon |
| `.../capture/host.ts` | browser wiring (dynamic import only) |
| `.../privacy/consent.ts` | config, consent, privacy signals, capture decision |
| `.../lib/timeline.ts` | state at time t, markers, breakpoints, gaps, transcript |
| `.../lib/journey.ts`, `lib/bundle.ts`, `lib/demo.ts` | funnels, bundles, demo sessions |
| `.../lib/server.ts` | encrypted store, retention, share tokens, access, audit |
| `.../player/*`, `SessionReplayViewer.tsx`, `SessionReplayIndex.tsx`, `hooks/useSessionReplay.ts` | UI |
| `apps/web/src/components/SessionReplayBootstrap.tsx` | gated loader in the root layout |

## Known gaps

- The store is process-local and encrypted in memory. A durable backend should implement the same `ReplayStore` surface and keep encryption.
- Visual reconstruction is a wireframe "stage" (route, viewport, pointer, scroll, requests, errors), not a pixel replay of the DOM.

## Tests

`apps/web/src/features/session-replay/session-replay.test.ts` covers redaction, the recorder against fakes (including restoring patched globals), transport retry and beacon, capture decisions, the player model, journeys, bundles, encryption, retention and share tokens. `apps/web/src/app/api/session-replay/route.test.ts` covers the routes.
