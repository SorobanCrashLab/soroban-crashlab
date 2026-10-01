# Content Security Policy

How the Soroban CrashLab dashboard builds and enforces its
`Content-Security-Policy`, and why it is shaped the way it is.

Implements [#1545], which replaced a policy that granted both
`'unsafe-inline'` and `'unsafe-eval'`. Those two directives together disabled
the protection a CSP exists to provide: any injected inline script, and any
script gadget reachable through `eval`, executed freely. The dashboard renders
user-influenced content (run logs, crash reports, markdown previews), so that
surface is real rather than theoretical.

## The policy

Built per request by `buildCspHeader()` in `apps/web/src/lib/csp.ts`:

```
default-src 'self'
script-src 'self' 'nonce-<per-request>'
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self' https:
frame-ancestors 'self'
form-action 'self'
base-uri 'self'
object-src 'none'
upgrade-insecure-requests
```

The rest of the response-header set (`X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) still ships
statically from `next.config.ts` and `vercel.json`, because none of them vary per
request. See [`SECURITY.md`](SECURITY.md) for that table.

## Why the policy lives in the proxy, not `next.config.ts`

A CSP nonce is a single-use token. It only protects anything if it is
**unpredictable** and **different for every response**. A value emitted from
`headers()` in `next.config.ts` is fixed when the server starts, so it would
either:

- pin one nonce for the life of the deployment — anything that observed a single
  response could replay it to authorize its own injected script on every later
  one; or
- ship no nonce at all, in which case a strict `script-src` blocks Next.js's own
  hydration scripts and the app does not work at all.

So the policy is attached in `apps/web/src/proxy.ts` (Next.js 16's successor to
`middleware.ts`), which mints a fresh 128-bit nonce per request and sends it
**twice**:

- on the **request** headers, so Next.js can read it back out of
  `Content-Security-Policy` while rendering and stamp it onto every
  framework-emitted `<script>` and `<style>` tag
  (`getScriptNonceFromHeader` in `next/dist/server/app-render`);
- on the **response** headers, so the browser enforces exactly the policy the
  markup was rendered against.

`apps/web/src/proxy.test.ts` asserts the two copies agree.

The proxy matcher was widened from `['/api/:path*']` to all document routes —
under the original matcher no page would have received a policy at all. Static
asset paths are excluded, since they are immutable, shared between visitors, and
are not documents.

## Why rendering is forced dynamic

This is the main cost of the approach, and it is not optional.

Next.js can only apply a nonce to a response that is **rendered per request**. A
statically prerendered page is built at compile time, before any request headers
exist, so its inline scripts are emitted with `"nonce":"$undefined"`. A
nonce-only `script-src` then blocks them and the page never hydrates.

Before this change all 69 page routes were statically prerendered (only the API
routes and three run pages were dynamic), so the nonce would have been inert.
The fix forces dynamic rendering via `export const dynamic = 'force-dynamic'`
in `apps/web/src/app/layout.tsx`.

`/api-docs` previously declared `force-static`; that has been changed to
`force-dynamic`, since re-declaring it would have opted that one route back out
of the nonce and broken it specifically.

**What this costs:** every page is server-rendered per request, so TTFB rises and
responses are no longer CDN-cacheable as static assets. That is a real
regression in the serving model, accepted deliberately in exchange for a policy
that actually blocks injected script. The `lighthouserc*.js` budgets are the
thing to watch; revisit this if the app moves behind full-route caching, in which
case a nonce cannot be used at all and hashes or a static-allowlist policy are
the alternatives.

## Why `'unsafe-inline'` is still allowed for styles

`style-src` keeps `'unsafe-inline'`. React emits inline `style` attributes during
SSR, and CSS injection is a materially smaller risk than script execution. Only
`script-src` was hardened, which is where the XSS impact lives.

## Why `'unsafe-eval'` is gone entirely

The only `eval` in the production client bundle is Sentry's
`Script.prototype.runInThisContext`. It is used only by the Debug/SourceMap
integration, which `sentry-client.ts` does not enable, and it is already wrapped
in a `try { ... } catch` that falls back to a plain function. Nothing in this app
needs dynamic code evaluation, so it is not re-granted.

`'wasm-unsafe-eval'` was deliberately **not** used as a concession: it exists to
permit WebAssembly compilation, which this app does not do. Adding it would
loosen the policy without addressing a real need.

## The pre-paint bootstrap

`layout.tsx` used to inline the theme/accessibility bootstrap via
`dangerouslySetInnerHTML`. That inline block is now served as a static file,
`apps/web/public/theme-script.js`, loaded with `<script src="/theme-script.js" />`
so `script-src 'self'` covers it without a nonce.

It must stay synchronous and inside `<head>`: adding `async` or `defer` would let
it run after first paint and reintroduce the flash-of-wrong-theme it exists to
prevent.

Splitting the logic across two files is how they drift, so
`apps/web/src/app/theme-bootstrap.test.ts` asserts the static file stays in sync
with `generateThemeBootstrapScript()` in `theme-provider-utils.ts`, and that it
keeps setting `theme-ready` — the class `globals.css` gates color transitions on.
Losing that line would not throw; it would quietly bring back the theme flash.

## Guarding against regressions

| Test | Guards |
|------|--------|
| `src/lib/csp.test.ts` | Directive contents; no `unsafe-inline`/`unsafe-eval` in `script-src`; nonce uniqueness and parseability |
| `src/proxy.test.ts` | The response actually carries the policy; request and response copies agree; the 429 rate-limit path is preserved |
| `src/app/theme-bootstrap.test.ts` | Static bootstrap stays in sync with the shared generator |
| `src/app/security-headers.test.ts` | No static CSP sneaks back into `next.config.ts` or `vercel.json` |

One subtlety worth knowing: `getScriptNonceFromHeader` silently ignores a nonce it
cannot parse, which would block every framework script on the page with no
error. `csp.test.ts` therefore checks generated nonces against Next's exact
parser, `/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/`.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [`SECURITY.md`](SECURITY.md) | Reporting policy and the full response-header table |
| [`THREAT_MODEL_ARTIFACT_HANDLING.md`](THREAT_MODEL_ARTIFACT_HANDLING.md) | STRIDE threat model for artifact ingestion and storage |

[#1545]: https://github.com/SorobanCrashLab/soroban-crashlab/issues/1545
