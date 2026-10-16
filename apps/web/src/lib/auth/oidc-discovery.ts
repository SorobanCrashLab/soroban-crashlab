/**
 * OIDC discovery with a pinned issuer (#1893).
 *
 * The issuer comes from configuration, never from the network. The discovery
 * document is fetched once per issuer and rejected unless its `issuer` equals
 * the pin exactly and every endpoint we will talk to is https — a document
 * that names a different issuer, or points the token or JWKS endpoint at
 * plaintext, is the start of an IdP-mixup or key-substitution attack.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  code_challenge_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
}

export class OidcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OidcError';
  }
}

function requireHttps(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new OidcError('discovery_invalid', `discovery is missing ${name}`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcError('discovery_invalid', `discovery ${name} is not a URL`);
  }
  if (url.protocol !== 'https:') throw new OidcError('discovery_invalid', `discovery ${name} must use https`);
  return value;
}

export function validateDiscovery(pinnedIssuer: string, document: unknown): OidcDiscovery {
  if (!document || typeof document !== 'object') {
    throw new OidcError('discovery_invalid', 'discovery document is not an object');
  }
  const doc = document as Record<string, unknown>;
  if (doc.issuer !== pinnedIssuer) {
    throw new OidcError('issuer_mismatch', `discovery issuer ${String(doc.issuer)} does not match pinned ${pinnedIssuer}`);
  }

  const methods = doc.code_challenge_methods_supported;
  if (Array.isArray(methods) && !methods.includes('S256')) {
    throw new OidcError('discovery_invalid', 'issuer does not support PKCE S256');
  }

  return {
    issuer: pinnedIssuer,
    authorization_endpoint: requireHttps('authorization_endpoint', doc.authorization_endpoint),
    token_endpoint: requireHttps('token_endpoint', doc.token_endpoint),
    jwks_uri: requireHttps('jwks_uri', doc.jwks_uri),
    code_challenge_methods_supported: Array.isArray(methods) ? (methods as string[]) : undefined,
    id_token_signing_alg_values_supported: Array.isArray(doc.id_token_signing_alg_values_supported)
      ? (doc.id_token_signing_alg_values_supported as string[])
      : undefined,
  };
}

const cache = new Map<string, Promise<OidcDiscovery>>();

/** Fetched once per issuer; a failed fetch is not cached so it can be retried. */
export function getDiscovery(pinnedIssuer: string, fetchImpl: FetchLike = fetch): Promise<OidcDiscovery> {
  requireHttps('issuer', pinnedIssuer);
  let pending = cache.get(pinnedIssuer);
  if (!pending) {
    const url = `${pinnedIssuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    pending = fetchImpl(url, { redirect: 'error' })
      .then(async (response) => {
        if (!response.ok) throw new OidcError('discovery_unavailable', `discovery responded ${response.status}`);
        return validateDiscovery(pinnedIssuer, await response.json());
      })
      .catch((error) => {
        cache.delete(pinnedIssuer);
        throw error;
      });
    cache.set(pinnedIssuer, pending);
  }
  return pending;
}

export function resetDiscoveryCache(): void {
  cache.clear();
}
