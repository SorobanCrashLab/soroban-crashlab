/**
 * Hardened OIDC external authentication (#1893).
 *
 * Authorization code + PKCE (S256) against an issuer pinned in configuration.
 * `start` mints state, nonce and code verifier and keeps them server-side,
 * keyed by state; `complete` consumes that record exactly once (a replayed
 * callback or nonce finds nothing), exchanges the code with the exact
 * configured redirect_uri, validates the ID token (oidc-token.ts), maps claims
 * to a role (oidc-role-mapping.ts) and audits the outcome either way.
 *
 * Every dependency with a side effect — fetch, clock, audit, role store — is
 * injected so the adversarial suite runs against a local stub IdP.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { AuditEntryInput } from '../audit/audit-log';
import type { UserRole } from '../storage/role-store';
import { getDiscovery, OidcError, type FetchLike } from './oidc-discovery';
import { JwksCache } from './oidc-jwks';
import { mapClaimsToRole, parseRoleMapping, type RoleMapping } from './oidc-role-mapping';
import { DEFAULT_CLOCK_SKEW_SECONDS, validateIdToken, type IdTokenClaims } from './oidc-token';

export { OidcError } from './oidc-discovery';

export const OIDC_STATE_COOKIE = 'crashlab_oidc_state';
export const PENDING_LOGIN_TTL_MS = 10 * 60_000;

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
  clockSkewSeconds: number;
  roleMapping: RoleMapping;
}

type OidcEnvVar =
  | 'OIDC_ISSUER'
  | 'OIDC_CLIENT_ID'
  | 'OIDC_CLIENT_SECRET'
  | 'OIDC_REDIRECT_URI'
  | 'OIDC_SCOPES'
  | 'OIDC_CLOCK_SKEW_SECONDS'
  | 'OIDC_ROLE_MAPPING';

export type OidcEnv = Partial<Record<OidcEnvVar, string>>;

/** Reads the env contract documented in docs/ENV.md. Throws when incomplete. */
export function loadOidcConfig(
  env: OidcEnv = {
    OIDC_ISSUER: process.env.OIDC_ISSUER,
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
    OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
    OIDC_SCOPES: process.env.OIDC_SCOPES,
    OIDC_CLOCK_SKEW_SECONDS: process.env.OIDC_CLOCK_SKEW_SECONDS,
    OIDC_ROLE_MAPPING: process.env.OIDC_ROLE_MAPPING,
  },
): OidcConfig {
  const required = (name: OidcEnvVar) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  };
  const skew = env.OIDC_CLOCK_SKEW_SECONDS ? Number.parseInt(env.OIDC_CLOCK_SKEW_SECONDS, 10) : DEFAULT_CLOCK_SKEW_SECONDS;
  if (!Number.isInteger(skew) || skew < 0 || skew > 300) throw new Error('OIDC_CLOCK_SKEW_SECONDS must be 0–300');

  return {
    issuer: required('OIDC_ISSUER'),
    clientId: required('OIDC_CLIENT_ID'),
    clientSecret: env.OIDC_CLIENT_SECRET?.trim() || undefined,
    redirectUri: required('OIDC_REDIRECT_URI'),
    scopes: env.OIDC_SCOPES?.trim() || 'openid email profile',
    clockSkewSeconds: skew,
    roleMapping: parseRoleMapping(env.OIDC_ROLE_MAPPING),
  };
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

interface PendingLogin {
  nonce: string;
  verifier: string;
  expiresAt: number;
}

export interface OidcLoginSuccess {
  /**
   * `<issuer>#<hex(sub)>` — stable across IdPs and used as the role-store
   * identity. `sub` is hex-encoded because the role store lowercases keys and
   * `sub` is case-sensitive: `Ab` and `aB` must stay different people.
   */
  identity: string;
  role: UserRole;
  claims: IdTokenClaims;
}

export interface OidcClientDeps {
  config: OidcConfig;
  fetchImpl?: FetchLike;
  now?: () => number;
  audit: (input: AuditEntryInput) => void;
  /** Persists the mapped role (JIT provisioning); returns the previous role, if any. */
  grantRole: (identity: string, role: UserRole) => Promise<UserRole | undefined>;
}

export class OidcClient {
  private readonly pending = new Map<string, PendingLogin>();
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private jwks: JwksCache | null = null;

  constructor(private readonly deps: OidcClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  /** Returns the IdP URL to redirect to and the state to bind in a cookie. */
  async start(): Promise<{ url: string; state: string }> {
    const { config } = this.deps;
    const discovery = await getDiscovery(config.issuer, this.fetchImpl);
    this.sweep();

    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const { verifier, challenge } = createPkcePair();
    this.pending.set(state, { nonce, verifier, expiresAt: this.now() + PENDING_LOGIN_TTL_MS });

    const url = new URL(discovery.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state };
  }

  /**
   * Completes a login. `cookieState` is the state bound to the browser at
   * start; it must equal the returned `state`, which must name a live pending
   * login. Any failure is audited as a denial and rethrown.
   */
  async complete(params: { code: string | null; state: string | null; cookieState: string | null }): Promise<OidcLoginSuccess> {
    try {
      return await this.completeUnaudited(params);
    } catch (error) {
      const code = error instanceof OidcError ? error.code : 'internal_error';
      this.deps.audit({
        action: 'auth.login.denied',
        target: `oidc:${this.deps.config.issuer}`,
        metadata: { reason: code },
      });
      throw error;
    }
  }

  private async completeUnaudited({
    code,
    state,
    cookieState,
  }: {
    code: string | null;
    state: string | null;
    cookieState: string | null;
  }): Promise<OidcLoginSuccess> {
    const { config } = this.deps;
    if (!state || !cookieState || state !== cookieState) throw new OidcError('state_mismatch', 'OIDC state does not match');

    // Single use: deleted before anything else can fail, so a replay finds nothing.
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiresAt <= this.now()) throw new OidcError('state_unknown', 'OIDC login expired or already used');
    if (!code) throw new OidcError('missing_code', 'authorization code missing');

    const discovery = await getDiscovery(config.issuer, this.fetchImpl);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: pending.verifier,
    });
    if (config.clientSecret) body.set('client_secret', config.clientSecret);

    const response = await this.fetchImpl(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
      redirect: 'error',
    });
    if (!response.ok) throw new OidcError('token_exchange_failed', `token endpoint responded ${response.status}`);
    const tokens = (await response.json()) as { id_token?: unknown };
    if (typeof tokens.id_token !== 'string') throw new OidcError('token_exchange_failed', 'token response has no id_token');

    this.jwks ??= new JwksCache({ jwksUri: discovery.jwks_uri, fetchImpl: this.fetchImpl, now: this.now });
    const claims = await validateIdToken(tokens.id_token, this.jwks, {
      issuer: config.issuer,
      clientId: config.clientId,
      nonce: pending.nonce,
      clockSkewSeconds: config.clockSkewSeconds,
      now: Math.floor(this.now() / 1000),
    });

    const identity = oidcIdentity(claims.iss, claims.sub);
    const mapping = mapClaimsToRole(claims, config.roleMapping);
    if (!mapping.allowed) throw new OidcError('mapping_denied', mapping.reason);

    const previous = await this.deps.grantRole(identity, mapping.role);
    if (previous !== mapping.role) {
      this.deps.audit({
        action: 'auth.role.grant',
        actor: SYSTEM_GRANTOR,
        target: identity,
        metadata: { previousRole: previous ?? null, role: mapping.role, matched: mapping.matched },
      });
    }
    this.deps.audit({ action: 'auth.login', actor: identity, target: `oidc:${config.issuer}`, metadata: { role: mapping.role } });

    return { identity, role: mapping.role, claims };
  }

  private sweep(): void {
    const now = this.now();
    for (const [state, login] of this.pending) {
      if (login.expiresAt <= now) this.pending.delete(state);
    }
  }
}

export function oidcIdentity(issuer: string, sub: string): string {
  return `${issuer}#${Buffer.from(sub, 'utf8').toString('hex')}`;
}

/** Role grants made by the mapping policy rather than by a person. */
export const SYSTEM_GRANTOR = 'oidc-role-mapping';
