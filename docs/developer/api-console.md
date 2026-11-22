# Developer API Console (WIP)

Tracks issue #2285. This is an early scaffold, not a complete implementation.

The project already generates a real OpenAPI spec at `/api/openapi` (see
`apps/web/src/lib/openapi/spec.ts`, surfaced today at `/api-docs`). This scaffold is a separate,
interactive console that is not yet wired to that spec.

## Status

- [x] Component stubs for endpoint catalog, schema viewer, request builder, response inspector,
      history, collections, and curl-only snippet generation
- [x] `/developer/api` and `/developer/api/collections` placeholder routes
- [x] `history`, `collections`, and `proxy` API route stubs (return `501`)
- [ ] Load the real OpenAPI spec into the catalog/schema viewer
- [ ] Execute requests through a guarded proxy with auth/scope injection
- [ ] Request history persistence with secret redaction
- [ ] Multi-language snippet generation (TypeScript, Rust, Python)
- [ ] RBAC/environment safeguards for dangerous operations

## Code

- `apps/web/src/features/developer/api-console/`
- `apps/web/src/app/developer/api/`
- `apps/web/src/app/api/developer/{proxy,history,collections}/route.ts`

See the full requirements in issue #2285.
