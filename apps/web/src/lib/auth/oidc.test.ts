/**
 * Adversarial OIDC suite (#1893), run against a local stub IdP.
 */

import { createHash, createHmac, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntryInput } from '../audit/audit-log';
import type { UserRole } from '../storage/role-store';
import { OidcClient, oidcIdentity, type OidcConfig } from './oidc';
import { resetDiscoveryCache, validateDiscovery } from './oidc-discovery';
import { mapClaimsToRole, parseRoleMapping } from './oidc-role-mapping';
import { issueOidcSession, OIDC_SESSION_MAX_AGE_SECONDS, verifyOidcSession } from './oidc-session';
import { InMemoryRecordDriver, resetRecordDriver, setRecordDriver } from '../storage/record-driver';

const ISSUER = 'https://idp.test';
const CLIENT_ID = 'crashlab-web';
const REDIRECT_URI = 'https://crashlab.test/api/auth/oidc/callback';
const T0 = Date.parse('2026-10-16T12:00:00Z');

interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  publicJwk: Record<string, unknown>;
  alg: string;
}

function rsaKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, publicJwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig' }, alg: 'RS256' };
}

function ecKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { kid, privateKey, publicJwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig' }, alg: 'ES256' };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signJwt(key: SigningKey, claims: Record<string, unknown>, header: Record<string, unknown> = {}): string {
  const h = { alg: key.alg, kid: key.kid, typ: 'JWT', ...header };
  const input = `${b64(h)}.${b64(claims)}`;
  const signature =
    h.alg === 'ES256'
      ? sign('sha256', Buffer.from(input), { key: key.privateKey, dsaEncoding: 'ieee-p1363' })
      : sign('sha256', Buffer.from(input), key.privateKey);
  return `${input}.${signature.toString('base64url')}`;
}

/** A minimal IdP: discovery, JWKS and a token endpoint that enforces PKCE. */
class StubIdp {
  keys: SigningKey[] = [rsaKey('key-1')];
  discoveryIssuer = ISSUER;
  jwksFetches = 0;
  lastTokenRequest: URLSearchParams | null = null;
  /** Overrides the id_token minted at the token endpoint. */
  mint: (nonce: string) => string = (nonce) => signJwt(this.keys[0], this.claims({ nonce }));
  private challenges = new Map<string, { nonce: string; challenge: string }>();
  clockMs = T0;

  claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const now = Math.floor(this.clockMs / 1000);
    return {
      iss: ISSUER,
      sub: 'User-42',
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      email: 'u@example.test',
      email_verified: true,
      groups: ['crashlab-maintainers'],
      ...overrides,
    };
  }

  authorize(url: string): { code: string; state: string } {
    const params = new URL(url).searchParams;
    const code = `code-${this.challenges.size + 1}`;
    this.challenges.set(code, { nonce: params.get('nonce')!, challenge: params.get('code_challenge')! });
    return { code, state: params.get('state')! };
  }

  fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (input === `${ISSUER}/.well-known/openid-configuration`) {
      return json({
        issuer: this.discoveryIssuer,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (input === `${ISSUER}/jwks`) {
      this.jwksFetches += 1;
      return json({ keys: this.keys.map((key) => key.publicJwk) });
    }
    if (input === `${ISSUER}/token`) {
      const form = new URLSearchParams(String(init?.body));
      this.lastTokenRequest = form;
      const issued = this.challenges.get(form.get('code') ?? '');
      const verifierHash = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
      if (!issued || verifierHash !== issued.challenge || form.get('redirect_uri') !== REDIRECT_URI) {
        return json({ error: 'invalid_grant' }, 400);
      }
      return json({ id_token: this.mint(issued.nonce), token_type: 'Bearer' });
    }
    return json({ error: 'not_found' }, 404);
  };
}

const MAPPING = parseRoleMapping(
  JSON.stringify({
    claim: 'groups',
    rules: [
      { value: 'crashlab-analysts', role: 'analyst' },
      { value: 'crashlab-maintainers', role: 'maintainer' },
    ],
  }),
);

function setup(overrides: Partial<OidcConfig> = {}) {
  const idp = new StubIdp();
  const audit: AuditEntryInput[] = [];
  const roles = new Map<string, UserRole>();
  const client = new OidcClient({
    config: {
      issuer: ISSUER,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: 'openid email profile',
      clockSkewSeconds: 60,
      roleMapping: MAPPING,
      ...overrides,
    },
    fetchImpl: idp.fetch,
    now: () => idp.clockMs,
    audit: (entry) => audit.push(entry),
    grantRole: async (identity, role) => {
      const previous = roles.get(identity);
      roles.set(identity, role);
      return previous;
    },
  });

  const login = async () => {
    const { url, state } = await client.start();
    const { code } = idp.authorize(url);
    return { code, state, result: client.complete({ code, state, cookieState: state }) };
  };

  return { idp, client, audit, roles, login };
}

async function expectDenied(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => resetDiscoveryCache());

describe('happy path', () => {
  it('logs in with code + PKCE S256 and the exact redirect_uri', async () => {
    const { idp, client, audit, roles } = setup();
    const { url, state } = await client.start();
    const params = new URL(url).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(params.get('nonce')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toBe(state);

    const { code } = idp.authorize(url);
    const login = await client.complete({ code, state, cookieState: state });

    expect(login.role).toBe('maintainer');
    expect(login.identity).toBe(oidcIdentity(ISSUER, 'User-42'));
    expect(roles.get(login.identity)).toBe('maintainer');
    expect(idp.lastTokenRequest?.get('redirect_uri')).toBe(REDIRECT_URI);

    expect(audit.map((entry) => entry.action)).toEqual(['auth.role.grant', 'auth.login']);
    expect(audit[0]).toMatchObject({ target: login.identity, metadata: { role: 'maintainer', previousRole: null } });
    expect(audit[1]).toMatchObject({ actor: login.identity, target: `oidc:${ISSUER}` });
  });

  it('audits a role grant only when the mapped role changes', async () => {
    const { idp, audit, login } = setup();
    await (await login()).result;
    await (await login()).result;
    expect(audit.map((entry) => entry.action)).toEqual(['auth.role.grant', 'auth.login', 'auth.login']);

    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, groups: ['crashlab-analysts'] }));
    await (await login()).result;
    expect(audit.at(-2)).toMatchObject({
      action: 'auth.role.grant',
      metadata: { previousRole: 'maintainer', role: 'analyst' },
    });
  });

  it('accepts an ES256-signed token', async () => {
    const { idp, login } = setup();
    idp.keys = [ecKey('ec-1')];
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce }));
    await expect((await login()).result).resolves.toMatchObject({ role: 'maintainer' });
  });
});

describe('bad issuer', () => {
  it('rejects a discovery document naming another issuer', async () => {
    const { idp, client } = setup();
    idp.discoveryIssuer = 'https://evil.test';
    await expectDenied(client.start(), 'issuer_mismatch');
  });

  it('rejects an id_token from another issuer', async () => {
    const { idp, audit, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, iss: 'https://evil.test' }));
    await expectDenied((await login()).result, 'issuer_mismatch');
    expect(audit).toEqual([
      expect.objectContaining({ action: 'auth.login.denied', metadata: { reason: 'issuer_mismatch' } }),
    ]);
  });

  it('rejects plaintext endpoints and missing S256 support in discovery', () => {
    const base = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
    };
    expect(() => validateDiscovery(ISSUER, { ...base, jwks_uri: 'http://idp.test/jwks' })).toThrow(/https/);
    expect(() => validateDiscovery(ISSUER, { ...base, code_challenge_methods_supported: ['plain'] })).toThrow(/S256/);
  });
});

describe('JWKS rotation', () => {
  it('picks up a rotated key mid-session and stops trusting a withdrawn one', async () => {
    const { idp, login } = setup();
    await (await login()).result;
    expect(idp.jwksFetches).toBe(1);

    const retired = idp.keys[0];
    idp.keys = [rsaKey('key-2')];
    idp.clockMs += 31_000;
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce }));
    await expect((await login()).result).resolves.toMatchObject({ role: 'maintainer' });
    expect(idp.jwksFetches).toBe(2);

    idp.mint = (nonce) => signJwt(retired, idp.claims({ nonce }));
    await expectDenied((await login()).result, 'unknown_kid');
  });

  it('rate-limits refreshes for unknown kids', async () => {
    const { idp, login } = setup();
    await (await login()).result;
    idp.mint = (nonce) => signJwt({ ...idp.keys[0], kid: 'made-up' }, idp.claims({ nonce }));
    await expectDenied((await login()).result, 'unknown_kid');
    await expectDenied((await login()).result, 'unknown_kid');
    expect(idp.jwksFetches).toBe(1);
  });
});

describe('expiry and clock skew', () => {
  it('accepts a token expired within the skew window', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, exp: Math.floor(idp.clockMs / 1000) - 30 }));
    await expect((await login()).result).resolves.toBeDefined();
  });

  it('rejects a token expired beyond the skew window', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, exp: Math.floor(idp.clockMs / 1000) - 61 }));
    await expectDenied((await login()).result, 'token_expired');
  });

  it('honours a configured skew of zero', async () => {
    const { idp, login } = setup({ clockSkewSeconds: 0 });
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, exp: Math.floor(idp.clockMs / 1000) - 1 }));
    await expectDenied((await login()).result, 'token_expired');
  });

  it('rejects iat in the future and missing exp/iat', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, iat: Math.floor(idp.clockMs / 1000) + 120 }));
    await expectDenied((await login()).result, 'claims_invalid');
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, exp: undefined }));
    await expectDenied((await login()).result, 'claims_invalid');
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, iat: undefined }));
    await expectDenied((await login()).result, 'claims_invalid');
  });
});

describe('algorithm confusion', () => {
  it('rejects alg none', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => `${b64({ alg: 'none', kid: 'key-1' })}.${b64(idp.claims({ nonce }))}.`;
    await expectDenied((await login()).result, 'alg_not_allowed');
  });

  it('rejects HS256 signed with the public key as the HMAC secret', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => {
      const input = `${b64({ alg: 'HS256', kid: 'key-1' })}.${b64(idp.claims({ nonce }))}`;
      const pem = idp.keys[0].privateKey.export({ type: 'pkcs1', format: 'pem' });
      return `${input}.${createHmac('sha256', pem).update(input).digest('base64url')}`;
    };
    await expectDenied((await login()).result, 'alg_not_allowed');
  });

  it('rejects an alg that does not fit the key type', async () => {
    const { idp, login } = setup();
    // ES256 header pointing at an RSA key.
    idp.mint = (nonce) => signJwt(ecKey('key-1'), idp.claims({ nonce }));
    await expectDenied((await login()).result, 'alg_not_allowed');
  });

  it('rejects a tampered payload', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => {
      const [h, , s] = signJwt(idp.keys[0], idp.claims({ nonce })).split('.');
      return `${h}.${b64(idp.claims({ nonce, sub: 'admin' }))}.${s}`;
    };
    await expectDenied((await login()).result, 'bad_signature');
  });
});

describe('audience and azp', () => {
  it('rejects a token for another client', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, aud: 'other-client' }));
    await expectDenied((await login()).result, 'audience_mismatch');
  });

  it('requires azp to name this client for multi-audience tokens', async () => {
    const { idp, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, aud: [CLIENT_ID, 'other'] }));
    await expectDenied((await login()).result, 'audience_mismatch');
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, aud: [CLIENT_ID, 'other'], azp: 'other' }));
    await expectDenied((await login()).result, 'audience_mismatch');
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, aud: [CLIENT_ID, 'other'], azp: CLIENT_ID }));
    await expect((await login()).result).resolves.toBeDefined();
  });
});

describe('state and nonce', () => {
  it('rejects a replayed callback', async () => {
    const { client, login } = setup();
    const { code, state, result } = await login();
    await result;
    await expectDenied(client.complete({ code, state, cookieState: state }), 'state_unknown');
  });

  it('rejects a token whose nonce belongs to another login', async () => {
    const { idp, login } = setup();
    idp.mint = () => signJwt(idp.keys[0], idp.claims({ nonce: 'replayed-nonce' }));
    await expectDenied((await login()).result, 'nonce_mismatch');
  });

  it('rejects state that does not match the browser cookie (login CSRF)', async () => {
    const { idp, client } = setup();
    const { url, state } = await client.start();
    const { code } = idp.authorize(url);
    await expectDenied(client.complete({ code, state, cookieState: 'attacker-state' }), 'state_mismatch');
  });

  it('rejects an expired pending login', async () => {
    const { idp, client } = setup();
    const { url, state } = await client.start();
    const { code } = idp.authorize(url);
    idp.clockMs += 11 * 60_000;
    await expectDenied(client.complete({ code, state, cookieState: state }), 'state_unknown');
  });
});

describe('role mapping', () => {
  it('denies and audits an identity no rule maps', async () => {
    const { idp, audit, roles, login } = setup();
    idp.mint = (nonce) => signJwt(idp.keys[0], idp.claims({ nonce, groups: ['everyone'] }));
    await expectDenied((await login()).result, 'mapping_denied');
    expect(roles.size).toBe(0);
    expect(audit).toEqual([
      expect.objectContaining({ action: 'auth.login.denied', metadata: { reason: 'mapping_denied' } }),
    ]);
  });

  it('has no default role and picks the highest matching role', () => {
    expect(() =>
      parseRoleMapping(JSON.stringify({ claim: 'groups', rules: [{ value: 'a', role: 'analyst' }], default: 'maintainer' })),
    ).toThrow();
    const claims = { iss: ISSUER, sub: 's', aud: CLIENT_ID, exp: 1, iat: 1 };
    expect(mapClaimsToRole({ ...claims, groups: ['crashlab-analysts', 'crashlab-maintainers'] }, MAPPING)).toMatchObject({
      role: 'maintainer',
    });
    expect(mapClaimsToRole({ ...claims, groups: 'crashlab-analysts' }, MAPPING)).toMatchObject({ role: 'analyst' });
    expect(mapClaimsToRole(claims, MAPPING)).toMatchObject({ allowed: false });
  });

  it('can require a verified email', () => {
    const strict = { ...MAPPING, requireVerifiedEmail: true };
    const claims = { iss: ISSUER, sub: 's', aud: CLIENT_ID, exp: 1, iat: 1, groups: ['crashlab-analysts'] };
    expect(mapClaimsToRole({ ...claims, email_verified: false }, strict)).toMatchObject({ allowed: false });
    expect(mapClaimsToRole({ ...claims, email_verified: true }, strict)).toMatchObject({ allowed: true });
  });

  it('keeps case-distinct subjects distinct', () => {
    expect(oidcIdentity(ISSUER, 'Ab').toLowerCase()).not.toBe(oidcIdentity(ISSUER, 'aB').toLowerCase());
  });
});

describe('OIDC session cookie', () => {
  it('round-trips, rejects tampering and expires', async () => {
    process.env.CRASHLAB_OIDC_SESSION_SECRET = 'test-secret';
    setRecordDriver(new InMemoryRecordDriver());
    try {
      const session = (await issueOidcSession('id-1', T0))!;
      expect(await verifyOidcSession(session, T0)).toBe('id-1');
      const flipped = session.endsWith('0') ? '1' : '0';
      expect(await verifyOidcSession(`${session.slice(0, -1)}${flipped}`, T0)).toBeNull();
      expect(await verifyOidcSession(session, T0 + (OIDC_SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
    } finally {
      delete process.env.CRASHLAB_OIDC_SESSION_SECRET;
      resetRecordDriver();
    }
  });
});
