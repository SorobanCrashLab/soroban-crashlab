import { describe, expect, it } from 'vitest';
import { CSP_HEADER, NONCE_HEADER, buildCspHeader, generateCspNonce } from './csp';

/**
 * Guards the CSP hardening from issue #1545.
 *
 * The policy previously shipped `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
 * which let any injected inline script and any `eval` gadget execute. These
 * assertions fail loudly if either directive is reintroduced.
 */
describe('Content-Security-Policy (issue #1545)', () => {
  it('never allows unsafe-inline or unsafe-eval in script-src', () => {
    const csp = buildCspHeader(generateCspNonce());
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('carries a per-request nonce in script-src', () => {
    const nonce = generateCspNonce();
    const csp = buildCspHeader(nonce);

    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it('never allows unsafe-eval anywhere in the policy', () => {
    expect(buildCspHeader(generateCspNonce())).not.toContain('unsafe-eval');
  });

  it('keeps the directives the rest of the app depends on', () => {
    const csp = buildCspHeader(generateCspNonce());

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: https:");
    // Fonts are self-hosted via next/font; no Google origins are contacted.
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('generates a fresh, unpredictable nonce for every response', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateCspNonce()));

    // A reused nonce would let anything that observed one response authorize
    // its own injected script on later ones, so all 100 must differ.
    expect(nonces.size).toBe(100);
  });

  it('emits nonces in the base64 alphabet Next.js parses', () => {
    // Mirrors Next's /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/ parser in
    // get-script-nonce-from-header. A nonce it cannot parse is silently
    // dropped, which would block every framework script on the page.
    const parser = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

    for (let i = 0; i < 25; i++) {
      const nonce = generateCspNonce();
      const source = `'nonce-${nonce}'`;

      expect(source).toMatch(parser);
      expect(source.match(parser)?.[1]).toBe(nonce);
    }
  });

  it('uses 16 bytes of entropy per nonce', () => {
    // 16 bytes -> 24 base64 characters including padding.
    expect(generateCspNonce()).toHaveLength(24);
  });

  it('exports the header names the proxy and app agree on', () => {
    expect(CSP_HEADER).toBe('Content-Security-Policy');
    expect(NONCE_HEADER).toBe('x-nonce');
  });
});
