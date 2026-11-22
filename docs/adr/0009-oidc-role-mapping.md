# ADR 0009: OIDC external authentication and role-mapping policy

- **Status:** Accepted
- **Issue:** #1893
- **Code:** `apps/web/src/lib/auth/oidc*.ts`, `apps/web/src/app/api/auth/oidc/`

## Context

Teams want to sign in with their own IdP (Okta, Entra ID, Google) rather than
only GitHub. An OIDC relying party that trusts a discovery document, caches a
static JWKS, skips `aud`/`iss`/`azp`, has no clock-skew allowance, accepts
`none` or HS256, or lets `redirect_uri` drift is an account-takeover bug. The
part that decides *what an external identity is allowed to do* — role mapping —
is the part most likely to be configured wrong, so its policy is fixed here.

## Decision

### Flow

1. One issuer per deployment, pinned by `OIDC_ISSUER`. Discovery is fetched
   once; its `issuer` must equal the pin exactly and its endpoints must be
   https. An issuer that advertises PKCE methods must include `S256`.
2. Authorization code + PKCE (S256). `state`, `nonce` and the code verifier are
   32 random bytes each, held server-side keyed by `state` for 10 minutes and
   consumed exactly once. The browser holds only `state`, in an httpOnly
   cookie scoped to `/api/auth/oidc`; the callback requires the query `state`
   to equal the cookie (login CSRF).
3. `redirect_uri` is the configured `OIDC_REDIRECT_URI`, byte for byte, on both
   the authorization request and the code exchange.

### ID token validation

- `alg` from an asymmetric allowlist (RS*, PS*, ES256/384, EdDSA). `none` and
  HS* are rejected before any key is fetched; `oct` keys in the JWKS are
  ignored; the key named by `kid` must fit the algorithm (kty/crv, and `alg`
  if the JWK declares one).
- Unknown `kid` → one JWKS refresh (rotation), rate-limited to one per 30s.
  The refreshed set replaces the old one, so withdrawn keys stop verifying.
- `iss` = pin; `aud` contains the client id; multi-audience tokens must carry
  `azp` = client id, and any `azp` must equal it; `exp` and `iat` are
  mandatory; `exp`/`iat`/`nbf` are checked with `OIDC_CLOCK_SKEW_SECONDS`
  (default 60, max 300); `nonce` must equal the pending login's nonce.

### Role mapping

- Mapping is explicit configuration (`OIDC_ROLE_MAPPING`): one claim
  (e.g. `groups`) and a list of `value → role` rules.
- **There is no default role.** An identity that matches no rule is denied and
  the denial audited. The schema is strict, so a `default` key is a
  configuration error rather than a silently-ignored field. In particular
  nothing ever defaults to `maintainer`.
- Several matches → the highest role wins.
- Optional `requireVerifiedEmail` rejects identities whose `email_verified` is
  not `true`.

### JIT provisioning

- On every successful login the mapped role is written to the role store under
  identity type `oidc` and value `<issuer>#<hex(sub)>`. `sub` is hex-encoded
  because role-store keys are lowercased and `sub` is case-sensitive.
- The IdP is authoritative: a role removed from the IdP's groups is downgraded
  on next login. Manual changes in the roles UI last until the next login.
- A role change is audited as `auth.role.grant` (actor `oidc-role-mapping`);
  every login as `auth.login`; every failure as `auth.login.denied` with the
  machine-readable reason. Callers only ever see a generic "Sign-in was
  denied" — the reason lives in the audit log.

### Session

The callback issues `crashlab_oidc_session`, an HMAC-signed cookie
(`CRASHLAB_OIDC_SESSION_SECRET`) carrying the identity and an 8-hour expiry —
never a role. RBAC resolves the role from the role store on each request, the
same way it does for GitHub sessions.

## Consequences

- Deployments must configure a mapping before anyone can sign in via OIDC;
  forgetting it fails closed (503 at start), not open.
- Only one external issuer per deployment. Multi-IdP is a later extension of
  the pin to a list; validation is already per-issuer.
- Pending logins are in process memory; on multi-instance deployments the
  start and callback must reach the same instance (sticky sessions) until the
  pending store moves to the record driver.

## Maintainer setup

Credentials are not committed. Register a confidential client with the IdP
using the exact callback URL, then set `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
`OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_ROLE_MAPPING` and
`CRASHLAB_OIDC_SESSION_SECRET` (see `docs/ENV.md`).
