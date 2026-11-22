import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GITHUB_SESSION_COOKIE,
  constantTimeHexEqual,
  getGitHubSessionMaxAgeSeconds,
  getGitHubSessionSecret,
  invalidateGitHubSession,
  issueGitHubSession,
  verifyGitHubSession,
} from './github-session';
import { SESSION_ABSOLUTE_TIMEOUT_MS, SESSION_IDLE_TIMEOUT_MS } from './auth/server-session';
import { InMemoryRecordDriver, resetRecordDriver, setRecordDriver } from './storage/record-driver';

describe('GitHub session cookie', () => {
  const originalSecret = process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  const originalTtl = process.env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    env.CRASHLAB_GITHUB_SESSION_SECRET = 'a-test-signing-secret-for-session-cookies';
    setRecordDriver(new InMemoryRecordDriver());
  });

  afterEach(() => {
    if (originalSecret === undefined) delete env.CRASHLAB_GITHUB_SESSION_SECRET;
    else env.CRASHLAB_GITHUB_SESSION_SECRET = originalSecret;

    if (originalTtl === undefined) delete env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
    else env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS = originalTtl;
    resetRecordDriver();
  });

  it('exposes a stable cookie name', () => {
    expect(GITHUB_SESSION_COOKIE).toBe('crashlab_github_session');
  });

  it('round-trips a login', async () => {
    const session = await issueGitHubSession('Octocat');
    expect(session).not.toBeNull();
    expect(session).not.toContain('octocat');
    expect(await verifyGitHubSession(session)).toBe('octocat');
  });

  it('rejects verification when the User-Agent changes', async () => {
    const session = await issueGitHubSession('octocat', null, Date.now(), 'Browser/1.0');
    expect(await verifyGitHubSession(session, Date.now(), 'Browser/1.0')).toBe('octocat');
    expect(await verifyGitHubSession(session, Date.now(), 'Browser/2.0')).toBeNull();
  });

  it('rotates the cookie identifier and revokes the previous session on login', async () => {
    const first = await issueGitHubSession('octocat', null, 1000);
    const rotated = await issueGitHubSession('octocat', first, 2000);
    expect(rotated).not.toBe(first);
    expect(await verifyGitHubSession(first, 2000)).toBeNull();
    expect(await verifyGitHubSession(rotated, 2000)).toBe('octocat');
  });

  it('invalidates a session server-side on logout', async () => {
    const session = await issueGitHubSession('octocat');
    expect(await invalidateGitHubSession(session)).toBe(true);
    expect(await verifyGitHubSession(session)).toBeNull();
  });

  it('enforces a 30-minute idle timeout on verification', async () => {
    const idleSession = await issueGitHubSession('octocat', null, 1000);
    expect(await verifyGitHubSession(idleSession, 1000 + SESSION_IDLE_TIMEOUT_MS)).toBeNull();

    const activeSession = await issueGitHubSession('octocat', null, 1000);
    expect(await verifyGitHubSession(activeSession, 1000 + SESSION_IDLE_TIMEOUT_MS - 1)).toBe('octocat');
    expect(await verifyGitHubSession(activeSession, 1000 + SESSION_IDLE_TIMEOUT_MS * 2 - 1)).toBeNull();
  });

  it('enforces a 12-hour absolute timeout despite recent activity', async () => {
    const session = await issueGitHubSession('octocat', null, 1000);
    const lastMoment = 1000 + SESSION_ABSOLUTE_TIMEOUT_MS - 1;
    for (
      let at = 1000 + SESSION_IDLE_TIMEOUT_MS - 1;
      at < lastMoment;
      at += SESSION_IDLE_TIMEOUT_MS - 1
    ) {
      expect(await verifyGitHubSession(session, at)).toBe('octocat');
    }
    expect(await verifyGitHubSession(session, lastMoment)).toBe('octocat');
    expect(await verifyGitHubSession(session, 1000 + SESSION_ABSOLUTE_TIMEOUT_MS)).toBeNull();
  });

  it('fails closed when the record store is unavailable', async () => {
    const session = await issueGitHubSession('octocat');
    setRecordDriver({
      name: 'unavailable',
      getRecord: async () => { throw new Error('store down'); },
      putRecord: async () => { throw new Error('store down'); },
      updateRecordIfPresent: async () => { throw new Error('store down'); },
      deleteRecord: async () => { throw new Error('store down'); },
      addToIndex: async () => {},
      removeFromIndex: async () => {},
      listIndex: async () => [],
      clearIndex: async () => {},
      appendEntry: async () => {},
      listEntries: async () => [],
      countEntries: async () => 0,
      trimEntries: async () => {},
    });
    expect(await verifyGitHubSession(session)).toBeNull();
  });

  it('does not issue sessions from the in-memory fallback outside tests', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalRedisUrl = process.env.KV_REST_API_URL;
    const originalRedisToken = process.env.KV_REST_API_TOKEN;
    process.env.NODE_ENV = 'production';
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      await expect(issueGitHubSession('octocat')).rejects.toThrow('Durable session storage');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalRedisUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = originalRedisUrl;
      if (originalRedisToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = originalRedisToken;
    }
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
    expect(getGitHubSessionMaxAgeSeconds()).toBe(43200);

    env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS = '3600';
    expect(getGitHubSessionMaxAgeSeconds()).toBe(3600);

    env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS = '604800';
    expect(getGitHubSessionMaxAgeSeconds()).toBe(43200);
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
