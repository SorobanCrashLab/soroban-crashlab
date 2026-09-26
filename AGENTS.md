# AGENTS

This repository is configured as a pnpm workspace. Install dependencies from the
repository root and run app-level scripts via the workspace package path instead of
using npm at the root or inside apps/web.

## Setup

```bash
pnpm install --frozen-lockfile
```

## Common commands

```bash
pnpm --dir apps/web run lint
pnpm --dir apps/web run test
pnpm --dir apps/web run build
pnpm --dir apps/web run dev
```

## Guidance

- Do not add a root-level npm lockfile or duplicate package manifest.
- Keep the workspace root as the source of truth for dependency installation.
- Prefer `pnpm --dir apps/web ...` when invoking the web app scripts.
