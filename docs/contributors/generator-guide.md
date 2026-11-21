# CrashLab Code Generator Guide

The CrashLab CLI provides code generators that produce lint-clean, type-safe code following project conventions. This guide explains how to use and customize the generators.

## Overview

Code generators help maintain consistency across the codebase by providing templates that follow project conventions. All generated code passes linting and type checking out of the box.

## Available Generators

### Page Generator

Generates a Next.js page component following the project's patterns.

```bash
crashlab generate page dashboard
crashlab generate page user-profile
crashlab scaffold page settings
```

**Output:**
```
apps/web/src/app/[name]/page.tsx
```

**Features:**
- Uses `use client` directive when needed
- Includes proper TypeScript types
- Follows the data-fetching pattern with useEffect
- Includes loading and error states
- Uses project's component and hook imports
- Follows Tailwind CSS conventions

### API Route Generator

Generates a Next.js API route with schema validation.

```bash
crashlab generate api-route webhook
crashlab generate api-route payments
crashlab scaffold api-route notifications
```

**Output:**
```
apps/web/src/app/api/[name]/route.ts
```

**Features:**
- Uses `withRouteErrorHandling` wrapper
- Includes Zod schema validation
- Provides GET and POST handlers
- Returns proper error responses
- Includes TODO comments for implementation

### Component Generator

Generates a React component with proper TypeScript types.

```bash
crashlab generate component data-table
crashlab generate component modal
crashlab scaffold component card
```

**Output:**
```
apps/web/src/components/[name]/index.tsx
```

**Features:**
- Uses forwardRef pattern
- Exports TypeScript interface for props
- Follows project's component naming conventions
- Includes proper ARIA attributes support
- Uses Tailwind CSS for styling

### Hook Generator

Generates a custom React hook.

```bash
crashlab generate hook use-api-data
crashlab generate hook use-favorites
crashlab scaffold hook use-local-storage
```

**Output:**
```
apps/web/src/hooks/use[name].ts
```

**Features:**
- Follows React hook naming convention
- Includes proper TypeScript types
- Provides loading and error states
- Implements cleanup in useEffect
- Follows project's hook patterns

### Feature Module Generator

Generates a feature module with proper exports.

```bash
crashlab generate feature-module analytics
crashlab scaffold feature-module payments
```

**Output:**
```
apps/web/src/[name].ts
```

**Features:**
- Exports components and utilities
- Includes configuration interface
- Provides feature flag function
- Follows project's module pattern

### Integration Generator

Generates an integration module for external services.

```bash
crashlab generate integration stripe
crashlab generate integration github
crashlab scaffold integration slack
```

**Output:**
```
apps/web/src/lib/integrations/[name].ts
```

**Features:**
- Includes error handling
- Uses fetch API with proper headers
- Includes signature verification placeholder
- Follows project's error logging pattern

### Webhook Generator

Generates a webhook handler for incoming events.

```bash
crashlab generate webhook github
crashlab generate webhook slack
```

**Output:**
```
apps/web/src/app/api/webhooks/[name]/route.ts
```

**Features:**
- Verifies webhook signatures
- Handles both GET and POST
- Includes proper error responses
- Follows security best practices

### Test Generator

Generates a vitest test file.

```bash
crashlab generate test user-service
crashlab generate test api-client
```

**Output:**
```
apps/web/src/[name].test.ts
```

**Features:**
- Includes vitest imports
- Has beforeEach for cleanup
- Provides test templates
- Follows project's test patterns

## Template System

### Template Locations

Templates are stored in the CLI directory:
```
tools/cli/src/generators/templates/
```

### Customizing Templates

To customize templates:

1. **Fork the CLI** - Modify the templates in the source
2. **Local overrides** - Create a `.crashlab/templates` directory in your project root
3. **Project-specific generators** - Create custom generator scripts

### Template Syntax

Templates use a simple interpolation syntax:

```typescript
// Variable substitution
${variableName}

// Function calls
$pascalCase(name)
$kebabCase(name)
$camelCase(name)
```

### Example: Creating a Custom Component

```typescript
// src/lib/integrations/custom.ts
import { logger } from '@/lib/logger';

export async function sendToCustomApi(
  payload: Record<string, unknown>,
  config: CustomApiConfig
): Promise<boolean> {
  // Custom implementation
}
```

## Naming Conventions

The generators follow these naming conventions:

| Input | PascalCase | kebab-case | camelCase |
|-------|------------|------------|-----------|
| user_profile | UserProfile | user-profile | userProfile |
| data-table | DataTable | data-table | dataTable |
| useApi | UseApi | use-api | useApi |

## Best Practices

### Generated Code

All generated code follows these rules:

1. **Linting** - No ESLint errors
2. **Type Checking** - No TypeScript errors
3. **Imports** - Uses project aliases (@/lib, @/components)
4. **Comments** - Includes TODO placeholders

### Adding New Generators

When adding new generators:

1. Create a new generator file in `src/generators/`
2. Register it in the CLI commands
3. Add tests for the generator
4. Update the documentation

### Example Generator Structure

```typescript
// src/generators/my-generator.ts
import { template } from './templates/template-engine.js';

export function myGenerator(name: string, options: Options): string {
  return template(`
    // Generated code for ${name}
    export function ${pascalCase(name)}() {
      return '${name}';
    }
  `, { name });
}
```

## Testing Generators

Test generators with:

```bash
# Dry run to see output
crashlab generate page test-page --dry-run

# Check for lint errors
pnpm --dir apps/web run lint

# Check for type errors
pnpm --dir apps/web run typecheck

# Run tests
pnpm --dir apps/web run test
```

## Migration Guide

### From Manual Setup

When migrating from manual code creation:

1. Run `crashlab doctor` to ensure environment is ready
2. Use `crashlab generate` for new files
3. Keep existing files but ensure they follow generated patterns

### Existing Files

To check if existing files match generator patterns:

```bash
# List all pages
ls apps/web/src/app/**/page.tsx

# Check a specific pattern
crashlab scaffold page --dry-run
```

## Troubleshooting

### "File already exists"

Use `--force` to overwrite or pick a different name:
```bash
crashlab generate page dashboard --force
```

### "Permission denied"

Make sure you're in the correct directory:
```bash
cd /path/to/soroban-crashlab
crashlab generate page dashboard
```

### Template Errors

If templates aren't rendering correctly:
1. Check the template syntax
2. Provide the correct context variables
3. File an issue with the template content