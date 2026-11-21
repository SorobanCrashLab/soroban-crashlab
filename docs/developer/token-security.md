# Token Security Notes (WIP)

Tracks issue #2275. This is a status note, not a security sign-off.

Existing guarantees (see `apps/web/src/lib/api-key-auth.ts`):

- Tokens are validated server-side against stored scoped records.
- Scope checks reject writes when the presented token lacks the required scope.

Open items from issue #2275 that are **not yet verified**:

- Hashed-at-rest storage and constant-time comparison for token secrets — needs a security
  review of `api-key-auth.ts`'s storage/comparison path before this is claimed.
- One-time secret reveal: confirm the UI never re-displays a plaintext secret after initial
  creation/rotation.
- No plaintext secrets in logs — needs an audit of request/response logging around token
  creation and rotation endpoints.
- "Revoke all for user/workspace" is not implemented (see
  [api-keys.md](./api-keys.md)), so there is currently no fast incident-response path for a
  suspected multi-token compromise.

Do not treat this document as confirming any of the above until each item has been checked
against the real implementation.
