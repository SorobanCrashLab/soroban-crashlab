import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import {
  GITHUB_SESSION_COOKIE,
  issueGitHubSession,
  verifyGitHubSession,
} from '@/lib/github-session';
import {
  issueOidcSession,
  OIDC_SESSION_COOKIE,
  verifyOidcSession,
} from '@/lib/auth/oidc-session';
import { InMemoryRecordDriver, resetRecordDriver, setRecordDriver } from '@/lib/storage/record-driver';

describe('POST /api/auth/logout', () => {
  const originalGitHubSecret = process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  const originalOidcSecret = process.env.CRASHLAB_OIDC_SESSION_SECRET;

  beforeEach(() => {
    process.env.CRASHLAB_GITHUB_SESSION_SECRET = 'github-test-secret';
    process.env.CRASHLAB_OIDC_SESSION_SECRET = 'oidc-test-secret';
    setRecordDriver(new InMemoryRecordDriver());
  });

  afterEach(() => {
    if (originalGitHubSecret === undefined) delete process.env.CRASHLAB_GITHUB_SESSION_SECRET;
    else process.env.CRASHLAB_GITHUB_SESSION_SECRET = originalGitHubSecret;
    if (originalOidcSecret === undefined) delete process.env.CRASHLAB_OIDC_SESSION_SECRET;
    else process.env.CRASHLAB_OIDC_SESSION_SECRET = originalOidcSecret;
    resetRecordDriver();
  });

  it('revokes the presented session and clears the session cookies', async () => {
    const githubSession = (await issueGitHubSession('octocat'))!;
    const oidcSession = (await issueOidcSession('oidc-user'))!;
    const request = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${GITHUB_SESSION_COOKIE}=${githubSession}; ${OIDC_SESSION_COOKIE}=${oidcSession}`,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await verifyGitHubSession(githubSession)).toBeNull();
    expect(await verifyOidcSession(oidcSession)).toBeNull();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
