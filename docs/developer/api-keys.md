# API Keys & Access Tokens Console (WIP)

Tracks issue #2275. This is an early scaffold, not a complete implementation.

Create/list/rotate/revoke for scoped tokens already exists:

- UI: `apps/web/src/app/settings/api/ApiTokenManager.tsx` (page at `/settings/api`)
- API: `apps/web/src/app/api/settings/tokens/{route,[id]/rotate,[id]/revoke}.ts`
- Scope enforcement: `apps/web/src/lib/api-key-auth.ts`

This issue's net-new surface — usage analytics, incident-wide controls, rotation with an
overlap/grace window, and scope-aware developer docs — is what this scaffold adds.

## Status

- [x] `tokenScopes.ts` / `tokenUsage.ts` shape definitions
- [x] `TokenList`, `TokenDetails`, `TokenUsagePanel`, `RotateTokenDialog` (overlap-window
      variant) component stubs
- [x] `/api/tokens/[id]/usage` route stub (return `501`)
- [x] `/settings/api-keys` placeholder page
- [ ] Real usage tracking (requests, errors, rate-limit hits) per token
- [ ] "Revoke all for user/workspace" incident control
- [ ] Rotation with actual overlap/grace-window enforcement (today's rotate is immediate)
- [ ] Developer snippets/examples per scope and use case — see
      [token-security.md](./token-security.md) for the security side of this
- [ ] Audit log integration for usage/incident actions

## Code

- `apps/web/src/features/developer/access-tokens/`
- `apps/web/src/lib/auth/{tokenScopes,tokenUsage}.ts`
- `apps/web/src/app/settings/api-keys/`
- `apps/web/src/app/api/tokens/[id]/usage/route.ts`

See the full requirements in issue #2275.
