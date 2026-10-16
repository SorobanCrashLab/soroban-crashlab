/**
 * JWKS with key-rotation support (#1893).
 *
 * Keys are looked up by `kid`. An unknown `kid` triggers one refresh of the
 * key set — that is how a rotation published by the IdP is picked up without a
 * restart. Refreshes are rate-limited so a stream of tokens with made-up kids
 * cannot turn us into a request amplifier against the IdP.
 */

import { createPublicKey, type KeyObject } from 'node:crypto';
import { OidcError, type FetchLike } from './oidc-discovery';

export interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  crv?: string;
  [member: string]: unknown;
}

export interface ResolvedKey {
  jwk: Jwk;
  key: KeyObject;
}

export interface JwksCacheOptions {
  jwksUri: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Minimum interval between refreshes, ms. */
  minRefreshIntervalMs?: number;
}

export class JwksCache {
  private keys = new Map<string, ResolvedKey>();
  private lastRefresh = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly minRefreshIntervalMs: number;

  constructor(private readonly options: JwksCacheOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.minRefreshIntervalMs = options.minRefreshIntervalMs ?? 30_000;
  }

  async getKey(kid: string): Promise<ResolvedKey> {
    const cached = this.keys.get(kid);
    if (cached) return cached;

    if (this.now() - this.lastRefresh >= this.minRefreshIntervalMs) {
      await this.refresh();
      const refreshed = this.keys.get(kid);
      if (refreshed) return refreshed;
    }
    throw new OidcError('unknown_kid', `no signing key with kid ${kid}`);
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<void> {
    this.lastRefresh = this.now();
    const response = await this.fetchImpl(this.options.jwksUri, { redirect: 'error' });
    if (!response.ok) throw new OidcError('jwks_unavailable', `JWKS responded ${response.status}`);
    const body = (await response.json()) as { keys?: Jwk[] };

    const next = new Map<string, ResolvedKey>();
    for (const jwk of body.keys ?? []) {
      // Encryption keys and kid-less keys are never used to verify signatures.
      if (!jwk.kid || (jwk.use && jwk.use !== 'sig')) continue;
      // Symmetric keys in a JWKS are how HS256-with-public-key confusion starts.
      if (jwk.kty === 'oct') continue;
      try {
        next.set(jwk.kid, { jwk, key: createPublicKey({ key: jwk, format: 'jwk' }) });
      } catch {
        // Skip malformed keys rather than failing the whole set.
      }
    }
    // Replace, not merge: a key the IdP has withdrawn stops verifying.
    this.keys = next;
  }
}
