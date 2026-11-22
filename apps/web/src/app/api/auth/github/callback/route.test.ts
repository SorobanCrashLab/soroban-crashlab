import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { issueState, STATE_COOKIE_NAME, NEXT_COOKIE_NAME } from '@/lib/github-oauth-state';

const CALLBACK_URL = 'http://localhost/api/auth/github/callback';

function callbackRequest(
  params: Record<string, string>,
  cookieState?: string
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieState !== undefined) {
    headers.cookie = `${STATE_COOKIE_NAME}=${cookieState}`;
  }
  return new NextRequest(`${CALLBACK_URL}?${new URLSearchParams(params).toString()}`, {
    headers,
  });
}

const validCode = 'valid-authorization-code';
const validState = 'bound-state-token';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/auth/github/callback', () => {
  it('redirects to the safe default on a successful code exchange', async () => {
    const request = callbackRequest({ code: validCode, state: validState }, validState);
    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${CALLBACK_URL.split('/api')[0]}/`);
    // State + next cookies are cleared on success (single-use).
    expect(response.headers.get('set-cookie')).toContain(`${STATE_COOKIE_NAME}=;`);
    expect(response.headers.get('set-cookie')).toContain(`${NEXT_COOKIE_NAME}=;`);
  });

  it('rejects a missing code', async () => {
    const request = callbackRequest({ state: validState }, validState);
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('code');
  });

  it('rejects a missing state parameter (possible CSRF)', async () => {
    const request = callbackRequest({ code: validCode });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('state');
  });

  it('rejects a mismatched state parameter (possible CSRF attack)', async () => {
    const request = callbackRequest(
      { code: validCode, state: 'a-different-state' },
      validState
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('state');
  });

  it('rejects a stale / tampered state cookie that fails cryptographic verification', async () => {
    const request = callbackRequest({ code: validCode, state: validState }, 'tampered.state');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('state');
  });

  it('rejects a replayed (double) callback once the state cookie has been cleared', async () => {
    const request = callbackRequest({ code: validCode, state: validState }, validState);
    const first = await GET(request);
    expect(first.status).toBe(302);

    // The state cookie was cleared on the first outcome, so replaying with the
    // same query state but no cookie is rejected.
    const replay = callbackRequest({ code: validCode, state: validState });
    const second = await GET(replay);
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toContain('state');
  });

  it('never redirects to a caller-influenced external URL (open redirect)', async () => {
    const malicious = 'https://evil.com/steal?token=';
    const request = callbackRequest(
      { code: validCode, state: validState, next: malicious },
      validState
    );
    const response = await GET(request);

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).not.toContain('evil.com');
    expect(location).toBe(`${CALLBACK_URL.split('/api')[0]}/`);
  });

  it('rejects protocol-relative and backslash next values (open redirect vectors)', async () => {
    for (const next of ['//evil.com/', '\\\\evil.com']) {
      const request = callbackRequest(
        { code: validCode, state: validState, next },
        validState
      );
      const response = await GET(request);
      expect(response.status).toBe(302);
      // Same-origin fallback only: never an external host.
      expect(response.headers.get('location')).toBe(`${CALLBACK_URL.split('/api')[0]}/`);
    }
  });

  it('does not log the authorization code (token never leaks to logs)', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const request = callbackRequest({ code: validCode, state: validState }, validState);
    await GET(request);

    const logged = info.mock.calls.map((args) => args.join(' '));
    expect(logged.some((line) => line.includes(validCode))).toBe(false);
  });

  it('accepts an HMAC-signed state and rejects a tampered one when a secret is configured', async () => {
    const originalSecret = process.env.CRASHLAB_GITHUB_STATE_SECRET;
    process.env.CRASHLAB_GITHUB_STATE_SECRET = 'test-state-secret-do-not-use-in-prod';

    try {
      const bound = await issueState();
      expect(bound).toMatch(/\..*/); // <nonce>.<hex-hmac>

      const validRequest = callbackRequest({ code: validCode, state: bound }, bound);
      const validResponse = await GET(validRequest);
      expect(validResponse.status).toBe(302);

      // Tamper with the nonce portion: signature no longer matches.
      const [nonce] = bound.split('.');
      const tampered = `${nonce.slice(0, -1)}x.${bound.split('.')[1]}`;
      const tamperedRequest = callbackRequest({ code: validCode, state: tampered }, bound);
      const tamperedResponse = await GET(tamperedRequest);
      expect(tamperedResponse.status).toBe(400);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.CRASHLAB_GITHUB_STATE_SECRET;
      } else {
        process.env.CRASHLAB_GITHUB_STATE_SECRET = originalSecret;
      }
    }
  });
});
