/**
 * lib/csp — single source of truth for the dashboard's Content-Security-Policy
 * (issue #1545).
 *
 * The policy used to ship `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
 * which effectively disables the XSS protection a CSP exists to provide: any
 * injected inline script, and any script gadget reached through `eval`, runs
 * freely. The dashboard renders user-influenced content (run logs, crash
 * reports, markdown previews), so that attack surface is real.
 *
 * This module builds a per-request policy carrying a cryptographic nonce.
 * Next.js reads the nonce back out of the `Content-Security-Policy` *request*
 * header (see `getScriptNonceFromHeader` in `next/dist/server/app-render`) and
 * stamps it onto every framework-emitted `<script>`/`<style>` tag, so the
 * generated markup is authorized without `'unsafe-inline'`.
 *
 * `'unsafe-eval'` is deliberately absent. The only `eval` in the client bundle
 * is Sentry's `Script.prototype.runInThisContext`, which is used solely by the
 * Debug/SourceMap integration — not enabled in `sentry-client.ts` — and is
 * already wrapped in a try/catch that falls back to a plain function. Nothing
 * in this app needs dynamic code evaluation, so it is not re-granted.
 *
 * Nonces are only meaningful on dynamically rendered responses: a statically
 * prerendered page is built at compile time, before any request headers exist,
 * so its inline scripts could never carry a matching nonce. See
 * `docs/CSP.md` for the full rationale.
 */

/** Header used to pass the nonce from the proxy into the app render. */
export const NONCE_HEADER = 'x-nonce';

/** Header carrying the policy itself, in both directions. */
export const CSP_HEADER = 'Content-Security-Policy';

/**
 * Number of random bytes behind each nonce. 16 bytes (128 bits) matches the
 * entropy guidance in the CSP specification and Next.js' own examples.
 */
const NONCE_BYTES = 16;

/**
 * Creates a fresh, unpredictable nonce for a single response.
 *
 * A nonce is a one-time-use token: reusing one across requests would let an
 * attacker who observes a single page load replay it to authorize their own
 * injected script on later responses. `crypto.getRandomValues` is available in
 * both the Node and Edge runtimes the proxy may execute under.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  // Base64 is what the CSP grammar expects after `nonce-`, and it round-trips
  // through Next's `^'nonce-([A-Za-z0-9+/_-]+={0,2})'$` parser unchanged.
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Builds the policy for a single response.
 *
 * `'self'` is kept alongside the nonce so statically served assets under
 * `public/` (favicons, the extracted theme bootstrap) remain loadable, and
 * `style-src` retains `'unsafe-inline'` for the inline style attributes React
 * emits during SSR — the XSS surface that matters here is script execution,
 * not style injection.
 */
export function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    // Fonts are self-hosted via next/font — no Google origins needed.
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}
