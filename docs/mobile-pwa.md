# Mobile-first and PWA support (#2260)

CrashLab is usable on a 360px-wide viewport and installable as a PWA.

## Responsive layout

- Layout is mobile-first: single-column cards, stacked tables that become
  scrollable regions, and 44px minimum touch targets.
- Tests: `e2e/mobile-responsive.spec.ts` asserts no horizontal page overflow at
  360/390/430px, that primary navigation is reachable, and that run/campaign
  tables scroll inside their containers.

## Offline behavior

The service worker (`public/sw.js`) uses the rules in
`src/lib/offline/cache-strategy.ts`:

| Request | Strategy |
| --- | --- |
| Navigations | Network-first, cached page, then `/offline.html` |
| Static assets | Stale-while-revalidate |
| API reads | Network-first, 60s cache |
| Mutations | Never cached |

Offline mutations are queued with an idempotency key
(`src/lib/offline/offline-queue.ts`) and replayed FIFO after reconnection;
deduplication prevents double submission after an ambiguous failure.

## Installability

`public/manifest.json` declares standalone display, 192/512px icons,
screenshots, shortcuts and a share target. `ServiceWorkerRegistrar` registers
the worker after hydration (inside `DeferredAppChrome`, so route first-load JS
budgets are unaffected) and announces offline/online transitions to screen
readers.
