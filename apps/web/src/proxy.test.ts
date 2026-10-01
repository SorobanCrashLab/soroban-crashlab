import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { CSP_HEADER } from './lib/csp';
import { InMemoryRecordDriver, setRecordDriver } from './lib/storage/record-driver';
import { resetRoleStore } from './lib/storage/role-store';
import { resetTokenPrincipalStore } from './lib/storage/token-principal-store';

/**
 * Route-level guard for the nonce-based CSP (issue #1545).
 *
 * The proxy is the only place the policy can be attached, because a static
 * `headers()` value cannot carry a per-request nonce. These assertions cover
 * the two properties the rest of the app depends on: the browser is told a
 * policy with no forbidden directives, and Next.js is handed the same policy on
 * the *request* so it can stamp the matching nonce onto emitted script tags.
 */
describe('proxy CSP nonce (issue #1545)', () => {
  beforeEach(async () => {
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
    await resetTokenPrincipalStore();
  });

  function request(path: string): NextRequest {
    return new NextRequest(new Request(`https://crashlab.test${path}`));
  }

  it('sends a policy on the response with no unsafe-inline or unsafe-eval', async () => {
    const response = await proxy(request('/runs'));
    const csp = response.headers.get(CSP_HEADER) ?? '';

    expect(csp).not.toBe('');
    expect(csp).not.toContain('unsafe-eval');

    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('forwards the policy on the request so Next.js can extract the nonce', async () => {
    const response = await proxy(request('/runs'));
    const requestHeaders = response.headers.get('x-middleware-override-headers');

    // NextResponse.next({ request }) forwards headers by listing them here and
    // carrying values in x-middleware-request-*, so assert the CSP round-trips
    // into the forwarded request rather than only onto the response.
    expect(requestHeaders).toContain('content-security-policy');

    const forwardedCsp =
      response.headers.get('x-middleware-request-content-security-policy') ??
      '';
    const responseCsp = response.headers.get(CSP_HEADER) ?? '';

    // The forwarded value is what Next.js parses the nonce out of, so it must
    // agree with what the browser is told to enforce.
    expect(forwardedCsp).toBe(responseCsp);
    expect(forwardedCsp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
  });

  it('issues a different nonce per request so one cannot be replayed', async () => {
    const first = await proxy(request('/runs'));
    const second = await proxy(request('/runs'));

    const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonceOf(first.headers.get(CSP_HEADER))).toBeDefined();
    expect(nonceOf(first.headers.get(CSP_HEADER))).not.toBe(
      nonceOf(second.headers.get(CSP_HEADER)),
    );
  });

  it('still rate limits API routes without losing the 429 response', async () => {
    // The rate limiter short-circuits with a 429; decorating the response must
    // not replace it with a fresh NextResponse.next(), which would silently
    // downgrade the limit to a pass-through.
    let limited: Response | undefined;
    for (let i = 0; i < 200; i++) {
      const response = await proxy(request('/api/runs'));
      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).toBeDefined();
    expect(limited!.headers.get(CSP_HEADER)).not.toBe('');
  });

  it('stamps a correlation id on document routes', async () => {
    const response = await proxy(request('/runs'));

    expect(response.headers.get('x-correlation-id')).toBeTruthy();
    expect(response.headers.get('X-Correlation-ID')).toBeTruthy();
  });

  it('matches page routes, not just /api', async () => {
    // The original matcher was ['/api/:path*'], which would have left every
    // document response without a policy at all.
    const { config } = await import('./proxy');
    const matchers = config.matcher;

    expect(matchers.some((m) => m.includes('_next/static'))).toBe(true);
    expect(matchers.some((m) => m.startsWith('/((?!'))).toBe(true);
  });
});
