# Observability: Sentry error reporting

CrashLab reports runtime errors from the browser, the Node.js server and the
edge runtime (proxy) to Sentry. This page covers the env contract, the release
pipeline that keeps stack traces readable, the privacy rules, and how to point
a self-hosted deployment at your own Sentry. Sentry SaaS and self-hosted Sentry
use the same configuration.

Sentry is **optional**. If `NEXT_PUBLIC_SENTRY_DSN` is not set, nothing is
initialised, nothing is uploaded, errors are logged to the console, and the
build needs no Sentry credentials.

## Env contract

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | runtime + build | Project DSN. Validated at boot: a malformed DSN, or one that contains a secret key, logs `[sentry] … invalid` and leaves Sentry off instead of crashing or sending nowhere. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | runtime + build | Environment name, for example `production`, `preview` or `self-hosted`. Defaults to the Vercel environment, else `NODE_ENV`. |
| `SENTRY_UPLOAD_SOURCEMAPS` | build | `true` uploads source maps and creates the release. Default `false`. |
| `SENTRY_AUTH_TOKEN` | build (secret) | Required when uploading. Scopes: `project:releases`, `org:read`; add `event:read` for the CI verification job. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | build | Organisation and project slugs. Required when uploading. |
| `SENTRY_URL` | build + CI | Base URL of a self-hosted Sentry (default `https://sentry.io`). |
| `SENTRY_RELEASE` | build | Overrides the release name. |
| `SENTRY_TUNNEL_ROUTE` | build | Path such as `/monitoring` that relays browser events through the app. |

`NEXT_PUBLIC_*` values are baked into the client bundle at build time, so set
them before `next build`, not only at runtime. Full reference:
[`docs/ENV.md`](../ENV.md).

## Releases and source maps

Every build has one release name, used by the build plugin and by all three
runtimes:

```
soroban-crashlab-web@<apps/web package.json version>+<git sha>
```

`next.config.ts` computes the name (from `SENTRY_RELEASE`, otherwise from the
version and `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA` or `git rev-parse HEAD`). It
exposes the name to the runtimes as `NEXT_PUBLIC_SENTRY_RELEASE`, so events
always match the uploaded maps.

With `SENTRY_UPLOAD_SOURCEMAPS=true`, the build:

1. generates **hidden** source maps (no `sourceMappingURL` comment in shipped
   JavaScript);
2. uploads them, keyed by debug id, to the release;
3. creates and finalises the release and associates its commits;
4. deletes the maps from the build output, so they are never served to browsers.

If the flag is on but `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` or `SENTRY_PROJECT` is
missing, the build fails with a message naming what is missing. A requested
upload that silently does nothing would leave traces unreadable.

### CI release job

`.github/workflows/sentry-release.yml` runs on pushes to `main` once the
repository variable `SENTRY_UPLOAD_ENABLED` is `true`. It builds with upload
on, then proves the maps work:

1. It finds a string literal from `CiRegressionResultsPanel.tsx` inside a built
   client chunk, at its exact line and column.
2. It sends a synthetic event whose stack frame points at that position, with
   the chunk's debug id.
3. It polls the Sentry API until the event is processed.
4. It fails unless the frame resolved back to `CiRegressionResultsPanel.tsx`.

Configure `secrets.SENTRY_AUTH_TOKEN`, and the variables `SENTRY_ORG`,
`SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN` (and `SENTRY_URL` for self-hosted).
On Vercel, set the same variables plus `SENTRY_UPLOAD_SOURCEMAPS=true` for
Production so deploy builds upload too.

## Release health

Session tracking is on whenever a DSN is set. The browser records one session
per page load, and the server records one session per request. Sessions carry
the release, so Sentry's *Releases* page shows adoption and crash-free rates
for each deployed build.

To connect releases with the changelog, follow
[`docs/RELEASE_PROCESS.md`](../RELEASE_PROCESS.md): bump the `apps/web`
version when you tag `vX.Y.Z`. The Sentry release for that build is then
`soroban-crashlab-web@X.Y.Z+<sha>`, and its health can be read alongside the
changelog entry.

## Privacy: what leaves the app

Every runtime uses the same deny-by-default `beforeSend`
(`scrubSentryEvent` in `apps/web/src/lib/integrations/sentry-options.ts`).
It builds a new event from an allowlist instead of deleting known-bad fields,
so a field that a future SDK version adds is dropped until someone allowlists
it. `sendDefaultPii` is off.

- **Kept:** event id, level, release, environment, exception types, stack
  frames (paths without query strings, no local variables), debug ids for
  source maps, the request method, OS/browser/runtime name and version, trace
  ids, and allowlisted tags.
- **Redacted in messages:** email addresses, bearer tokens, CrashLab, GitHub,
  Slack and Stripe tokens, JWTs, and long hex strings.
- **Dropped:** user, request URL/headers/cookies/body, extra data,
  breadcrumbs, server name, installed modules, and anything unknown.

## Ad blockers: the tunnel

Browser extensions often block requests to Sentry's ingest host. Set
`SENTRY_TUNNEL_ROUTE=/monitoring` (any unused path) and rebuild. Browser events
then go to your own origin and the server relays them. The tunnel is also
required for a self-hosted Sentry that is served over plain `http`, because
the Content-Security-Policy only allows `https:` connections from the browser.

## Self-hosting with your own Sentry

1. Create a project in your Sentry (SaaS, or self-hosted
   [getsentry/self-hosted](https://github.com/getsentry/self-hosted)) and copy
   its DSN.
2. For runtime reporting only, set `NEXT_PUBLIC_SENTRY_DSN` and
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT=self-hosted` before building. In Docker
   Compose, put them in `.env` (see `.env.docker.example`).
3. For readable stack traces, also set `SENTRY_UPLOAD_SOURCEMAPS=true`,
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` and, for self-hosted
   Sentry, `SENTRY_URL` for the build.
4. Check: trigger an error in the dashboard and confirm that the event shows
   the right release and environment, and a stack frame in a `.tsx` file
   rather than a minified chunk.

To turn Sentry off, unset `NEXT_PUBLIC_SENTRY_DSN` and rebuild.
