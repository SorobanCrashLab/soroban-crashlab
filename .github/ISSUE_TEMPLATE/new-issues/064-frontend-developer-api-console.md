---
name: "Frontend: Developer API Console - Interactive API Explorer, Auth Scopes, Request History & SDK Snippets"
description: "Create an in-app developer console and API explorer powered by OpenAPI for discovering endpoints, testing requests with scoped auth, inspecting responses, and generating SDK snippets"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Developers and integrators must rely on static docs or external tools to understand and test CrashLab APIs. This slows integration and increases auth/scope mistakes.

Gaps:
- No interactive in-app API explorer tied to current deployment/OpenAPI spec
- Difficult to test endpoints with correct API key scopes and headers
- No request/response history or reproducible examples
- No generated client snippets/examples for common workflows
- Poor visibility into rate limits, errors, and pagination/cursor patterns

## Proposed Solution

Build a **Developer API Console**:
- OpenAPI-driven endpoint catalog with schema docs and examples
- Interactive request builder (params, body, headers, auth token selection) with response inspector
- Environment-aware base URL/config and scoped token helper integration (#054)
- Request history, collections/saved requests, and shareable examples
- Code snippet generation (curl, TypeScript fetch, Rust, Python) and workflow recipes

## Requirements

### Functional
- [ ] Load and render OpenAPI spec (local/generated) with endpoint search, tags, and schema viewer
- [ ] Request builder with path/query/header/body editors, validation, and example payloads
- [ ] Auth integration: select API token (masked metadata), inject headers, display required scopes
- [ ] Execute requests and display response status, headers, body (JSON/tree/raw), timing, and size
- [ ] Request history with replay, save to collections, and export/share (redacted)
- [ ] Code snippet generation for common languages/SDK patterns
- [ ] Pagination/cursor helpers and error code explanations linked to docs (#060)
- [ ] RBAC and environment safeguards (disable dangerous operations in prod contexts as configured)

### Non-Functional
- [ ] Spec parsing/rendering performant for full API surface
- [ ] Secrets never persisted in plaintext; sensitive headers redacted in history by default
- [ ] Accessible UI for editors, trees, and keyboard navigation
- [ ] Works with mock/dev/prod base URL configurations

## Files to Modify / Create
```
apps/web/src/features/developer/api-console/
├── ApiConsole.tsx
├── EndpointCatalog.tsx
├── SchemaViewer.tsx
├── RequestBuilder.tsx
├── ResponseInspector.tsx
├── RequestHistory.tsx
├── Collections.tsx
├── SnippetGenerator.tsx
└── hooks/useApiConsole.ts

apps/web/src/app/developer/api/
├── page.tsx
└── collections/page.tsx

apps/web/src/app/api/developer/
├── proxy/route.ts (optional guarded proxy)
├── history/route.ts
└── collections/route.ts

docs/developer/api-console.md
```

## Acceptance Criteria
- Developers can discover and successfully test key API workflows in-app
- Auth/scope requirements clear; request history/snippets improve reproducibility
- Sensitive data redaction and RBAC safeguards enforced
- OpenAPI spec stays source of truth for explorer

## PR Guide
- Branch: `issue/064-frontend-developer-api-console`
- Phase 1: OpenAPI catalog + schema/request builder
- Phase 2: Execution/response inspector + auth integration
- Phase 3: History/collections/snippets
- Phase 4: Safeguards, docs, tests

**Estimated effort:** 5-6 weeks (200 pts)