---
name: "DX: Monorepo Developer Tooling - Unified CLI, Code Generation, Dev Environment & Onboarding Automation"
description: "Build comprehensive developer tooling including unified CLI, code generators for features/routes/components, automated dev environment setup, and interactive onboarding workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Developer onboarding and daily workflows are fragmented:
- No unified CLI for common tasks (scaffold feature, generate route, create integration)
- Manual setup steps prone to errors
- Inconsistent code patterns across features
- No interactive onboarding for new contributors
- Difficult to discover existing utilities and patterns

## Proposed Solution

**Developer Experience Platform** with unified tooling:

- **`crashlab` CLI**: Unified command for dev, test, scaffold, generate, diagnose
- **Code Generators**: Plop/Hygen-style generators for pages, API routes, components, hooks, integrations
- **Dev Environment**: One-command setup with dependency checks, env validation, seed data
- **Interactive Onboarding**: Guided first-contribution flow with codebase tour and task suggestions
- **Pattern Library**: Searchable catalog of existing patterns, utilities, and conventions

## Requirements

### Functional
- [ ] Unified CLI (`pnpm crashlab` / `npx crashlab`) with subcommands: `dev`, `doctor`, `scaffold`, `generate`, `seed`, `onboard`
- [ ] Generators for: page, API route, feature module, component, hook, integration, webhook plugin, test
- [ ] `crashlab doctor`: checks Node/Rust/pnpm/Docker versions, env vars, ports, dependencies
- [ ] `crashlab onboard`: interactive guide (setup → run tests → pick good-first-issue → create branch)
- [ ] Pattern catalog page in docs/site with searchable examples
- [ ] Template system supporting team conventions and custom overrides

### Non-Functional
- [ ] CLI startup < 200ms
- [ ] Generator output passes lint/typecheck out of the box
- [ ] Doctor completes in < 30s
- [ ] Works on Linux, macOS, Windows (WSL)

## Files to Modify / Create
```
tools/cli/
├── package.json
├── src/
│   ├── index.ts
│   ├── commands/
│   │   ├── dev.ts
│   │   ├── doctor.ts
│   │   ├── scaffold.ts
│   │   ├── generate.ts
│   │   ├── seed.ts
│   │   └── onboard.ts
│   ├── generators/
│   │   ├── page.ts
│   │   ├── api-route.ts
│   │   ├── feature.ts
│   │   ├── component.ts
│   │   ├── hook.ts
│   │   └── templates/
│   └── utils/

apps/web/src/app/dev-tools/
├── pattern-catalog/page.tsx
└── onboarding/page.tsx

docs/contributors/
├── cli-guide.md
└── generator-guide.md
```

## Acceptance Criteria
- `crashlab doctor` identifies common setup issues with actionable fixes
- Generators produce lint-clean, type-safe code following project conventions
- Onboarding flow guides new contributor to first successful test run
- CLI documented and tested

## PR Guide
- Branch: `issue/027-dx-unified-cli-tooling`
- Phase 1: CLI framework + doctor + dev commands
- Phase 2: Code generators + templates
- Phase 3: Onboarding flow + seed data
- Phase 4: Pattern catalog + docs

**Estimated effort:** 4-5 weeks