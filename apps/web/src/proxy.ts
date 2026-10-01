import { NextRequest, NextResponse } from 'next/server';
import { proxy as rateLimitProxy } from './rate-limit';
import { CSP_HEADER, NONCE_HEADER, buildCspHeader, generateCspNonce } from './lib/csp';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Next.js 16 proxy entry (successor to middleware.ts). Applies API rate
 * limiting via `proxy` from ./rate-limit and stamps every API response with a
 * correlation ID so requests can be traced end to end.
 *
 * It also mints a per-request Content-Security-Policy nonce and threads it into
 * the render (see ./lib/csp). Next reads the nonce back out of the *request*
 * `Content-Security-Policy` header and stamps it onto every framework-emitted
 * script and style tag, which is what lets the app drop `'unsafe-inline'`
 * from `script-src`. The same policy is echoed on the response so the browser
 * enforces exactly what was rendered against.
 *
 * The nonce only reaches the markup when the route renders per request, so
 * every page route is forced dynamic — see docs/CSP.md.
 *
 * Async because RBAC now resolves the caller's role from persisted identity
 * state rather than from the request, which is a storage round trip.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateCspNonce();
  const csp = buildCspHeader(nonce);

  const correlationId =
    request.headers.get(CORRELATION_ID_HEADER) || generateCorrelationId();

  // Forward the policy on the *request* so Next.js can extract the nonce while
  // rendering this response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER, csp);
  requestHeaders.set(NONCE_HEADER, nonce);

  // API routes stay rate limited; rateLimitProxy may short-circuit with a 429,
  // whose status and body must be preserved, so its response is the one we
  // decorate rather than replacing it with a fresh NextResponse.next().
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const response = isApiRoute
    ? await rateLimitProxy(request)
    : NextResponse.next({ request: { headers: requestHeaders } });

  // Echo the policy so the browser enforces exactly what was rendered against.
  response.headers.set(CSP_HEADER, csp);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  response.headers.set('X-Correlation-ID', correlationId);

  return response;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${Math.random().toString(36).substring(2, 11)}`;
}

export const config = {
  matcher: [
    /*
     * Every route, including documents. A static `headers()` CSP cannot carry
     * a per-request nonce, so the policy has to be attached here.
     *
     * Static asset paths are excluded: they are immutable, shared across
     * visitors, and are not documents, so a per-request nonce buys nothing
     * there while adding per-request crypto cost to every chunk request.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|txt|xml|webmanifest)$).*)',
  ],
};
