import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GITHUB_SESSION_COOKIE,
  constantTimeHexEqual,
  getGitHubSessionMaxAgeSeconds,
  getGitHubSessionSecret,
  issueGitHubSession,
  verifyGitHubSession,
} from './github-session';

describe('GitHub session cookie', () => {
  const originalSecret = process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  const originalTtl = process.env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    env.CRASHLAB_GITHUB_SESSION_SECRET = 'a-test-signing-secret-for-session-cookies';
  });

  afterEach(() => {
    if (originalSecret === undefined) delete env.CRASHLAB_GITHUB_SESSION_SECRET;
    else env.CRASHLAB_GITHUB_SESSION_SECRET = originalSecret;

    if (originalTtl === undefined) delete env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
    else env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS = originalTtl;
  });

  it('exposes a stable cookie name', () => {
    expect(GITHUB_SESSION_COOKIE).toBe('crashlab_github_session');
  });

  it('round-trips a login', async () => {
    const session = await issueGitHubSession('Octocat');
    expect(session).not.toBeNull();
    expect(await verifyGitHubSession(session)).toBe('octocat');
  });

  it('refuses to issue without a configured secret', async () => {
    delete env.CRASHLAB_GITHUB_SESSION_SECRET;
    expect(getGitHubSessionSecret()).toBeUndefined();
    expect(await issueGitHubSession('octocat')).toBeNull();
  });

  it('treats an empty secret as no secret', () => {
    env.CRASHLAB_GITHUB_SESSION_SECRET = '   ';
    expect(getGitHubSessionSecret()).toBeUndefined();
  });

  it('verifies nothing when no secret is configured', async () => {
    const session = await issueGitHubSession('octocat');
    delete env.CRASHLAB_GITHUB_SESSION_SECRET;
    expect(await verifyGitHubSession(session)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const session = await issueGitHubSession('octocat');
    expect(session).not.toBeNull();
    const tampered = `${(session as string).slice(0, -1)}${(session as string).endsWith('a') ? 'b' : 'a'}`;
    expect(await verifyGitHubSession(tampered)).toBeNull();
  });

  it('rejects a session signed with a different secret', async () => {
    const session = await issueGitHubSession('octocat');
    env.CRASHLAB_GITHUB_SESSION_SECRET = 'a-different-signing-secret';
    expect(await verifyGitHubSession(session)).toBeNull();
  });

  it('rejects a session value that is not a role in disguise', async () => {
    // A bare role is not a session: the role is looked up from the store, never
    // read out of the cookie.
    expect(await verifyGitHubSession('maintainer')).toBeNull();
    expect(await verifyGitHubSession('YWRtaW4=.notahmac')).toBeNull();
    expect(await verifyGitHubSession('.onlysignature')).toBeNull();
    expect(await verifyGitHubSession('')).toBeNull();
    expect(await verifyGitHubSession(undefined)).toBeNull();
    expect(await verifyGitHubSession(null)).toBeNull();
  });

  it('rejects a blank login at issue time', async () => {
    expect(await issueGitHubSession('   ')).toBeNull();
  });

  it('defaults the max age and honours an override', () => {
    delete env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
    expect(getGitHubSessionMaxAgeSeconds()).toBe(604800);

    env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS = '3600';
    expect(getGitHubSessionMaxAgeSeconds()).toBe(3600);
  });
});

describe('constantTimeHexEqual', () => {
  it('matches identical strings', () => {
    expect(constantTimeHexEqual('abcd', 'abcd')).toBe(true);
    expect(constantTimeHexEqual('', '')).toBe(true);
  });

  it('rejects differences at any position', () => {
    expect(constantTimeHexEqual('abcd', 'abce')).toBe(false);
    expect(constantTimeHexEqual('abcd', 'zbcd')).toBe(false);
  });

  it('rejects differing lengths', () => {
    expect(constantTimeHexEqual('abcd', 'abcde')).toBe(false);
  });
});
