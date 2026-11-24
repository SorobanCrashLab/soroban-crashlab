# CrashLab CLI User Guide

The `crashlab` CLI is a unified tool for development, testing, and code generation. It provides a consistent interface for common development tasks.

## Installation

### Global Installation (Recommended)

```bash
npm install -g @soroban-crashlab/cli
# or
pnpm add -g @soroban-crashlab/cli
```

### Local Installation

```bash
# From the repository root
pnpm install --filter crashlab
```

### Using npx (No Installation Required)

```bash
npx @soroban-crashlab/cli doctor
npx @soroban-crashlab/cli onboard
```

## Available Commands

### `crashlab doctor`

Check your development environment setup.

```bash
crashlab doctor
crashlab doctor --quiet  # Only show failures
```

The doctor command verifies:
- Node.js version (requires v18+)
- pnpm version (requires v8+)
- Rust/Cargo installation (optional)
- Docker installation (optional)
- Package manager setup
- Required environment variables
- Port availability
- Dependency installation
- TypeScript compilation

**Example output:**

```
🩺  CrashLab Doctor - Environment Check

Checking versions...
✓ Node.js: v20.10.0
✓ pnpm: v9.14.0
⚠ Docker: not installed

Checking environment...
✓ Package Manager: pnpm lockfile detected
⚠ Env: NEXT_PUBLIC_SUPABASE_URL: Not set (Optional: Set NEXT_PUBLIC_SUPABASE_URL for full functionality)

Checking dependencies...
✓ Dependencies: Installed and verified

Checking TypeScript...
✓ TypeScript: No type errors

   Summary: 4 passed, 2 warnings, 0 failed

✅ Environment check passed! You're ready to develop.
```

### `crashlab dev`

Start the development server.

```bash
crashlab dev
crashlab dev --port 4000
crashlab dev --host 0.0.0.0
crashlab dev --readonly  # Use readonly Redis (development mode)
crashlab dev --no-lint   # Skip linting
crashlab dev --no-check  # Skip type checking
```

Options:
- `-p, --port <port>` - Port to run the dev server on (default: 3000)
- `-h, --host <host>` - Host to bind the dev server to (default: localhost)
- `--active` - Enable React Server Components streaming
- `--readonly` - Use readonly Redis instance
- `--no-lint` - Skip linting during development
- `--no-check` - Skip TypeScript type checking

### `crashlab scaffold <type> <name>`

Generate code templates for common patterns.

```bash
crashlab scaffold page user-profile
crashlab scaffold api-route webhook
crashlab scaffold component data-table
crashlab scaffold hook use-api-data
crashlab scaffold feature-module analytics
```

Available scaffold types:
- `page` - Generate a Next.js page component
- `api-route` - Generate a Next.js API route
- `component` - Generate a React component
- `hook` - Generate a custom React hook
- `feature-module` - Generate a feature module with exports

Options:
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

### `crashlab generate <type> <name>`

Generate code from templates with validation.

```bash
crashlab generate page dashboard
crashlab generate api-route payments
crashlab generate component modal
crashlab generate hook use-favorites
crashlab generate integration stripe
crashlab generate webhook github
crashlab generate test user-service
```

Available generate types:
- `page` - Generate a Next.js page with loading states
- `api-route` - Generate an API route with schema validation
- `component` - Generate a React component with forwardRef
- `hook` - Generate a custom React hook
- `integration` - Generate an integration module
- `webhook` - Generate a webhook handler
- `test` - Generate a test file with vitest

Options:
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

### `crashlab seed`

Generate seed data files and optionally seed databases.

```bash
crashlab seed
crashlab seed --dry-run
crashlab seed --environment staging
crashlab seed --db
crashlab seed --redis
```

Options:
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing seed files
- `-e, --environment <env>` - Target environment (dev, staging, prod)
- `--db` - Seed the database
- `--redis` - Seed Redis

### `crashlab onboard`

Interactive onboarding for new contributors.

```bash
crashlab onboard
crashlab onboard --skip-setup
crashlab onboard --skip-tests
crashlab onboard --skip-issue
```

The onboarding flow:
1. Verifies your environment
2. Runs lint, type check, and tests
3. Shows a codebase tour
4. Suggests good first issues
5. Creates a branch for your contribution

### `crashlab check`

Quick environment check.

```bash
crashlab check
```

## Shell Completion

The CLI supports shell completion for Bash, Zsh, and Fish.

```bash
# Bash
crashlab completion > ~/.crashlab-completion.bash
source ~/.crashlab-completion.bash

# Zsh
crashlab completion > ~/.zsh/completion.d/_crashlab

# Fish
crashlab completion > ~/.config/fish/completions/crashlab.fish
```

## Exit Codes

- `0` - Success
- `1` - Failure (check the output for details)

## Examples

### Quick Start

```bash
# Check your environment
crashlab doctor

# Start development
crashlab dev

# Generate code
crashlab scaffold page user-dashboard

# Run tests
crashlab onboard
```

### Advanced Usage

```bash
# Generate a page with dry-run
crashlab generate page admin-users --dry-run

# Start dev server on custom port
crashlab dev --port 8080 --no-lint

# Seed development data
crashlab seed --environment dev

# Full onboarding
crashlab onboard
```

## Configuration

The CLI reads configuration from:
- Environment variables (prefixed with `CRASHLAB_`)
- `.crashlabrc` JSON file in the project root
- Default values

## Troubleshooting

### "Command not found"

If you get "command not found" after installation:
1. Make sure the global npm/pnpm bin directory is in your PATH
2. Try using `npx crashlab` instead

### "Permission denied"

On Unix systems, use `chmod +x` to make the binary executable, or run via `npx`:
```bash
npx @soroban-crashlab/cli doctor
```

### "Cannot find module"

If you installed locally and it's not working:
```bash
# Use pnpm's exec wrapper
pnpm exec crashlab doctor

# Or specify the path
./node_modules/.bin/crashlab doctor
```

## Contributing to the CLI

When contributing to the CLI:
1. Run `pnpm install` in `tools/cli/`
2. Use `tsx src/index.ts` for development
3. The CLI auto-reloads with `tsx watch src/index.ts`