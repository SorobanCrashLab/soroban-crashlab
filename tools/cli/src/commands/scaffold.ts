import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';

interface ScaffoldOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

const TEMPLATE_PATTERNS = {
  page: {
    file: 'page.tsx',
    dir: 'app/[name]',
    name: 'page',
  },
  'api-route': {
    file: 'route.ts',
    dir: 'app/api/[name]',
    name: 'api-route',
  },
  component: {
    file: 'index.tsx',
    dir: 'src/components/[name]',
    name: 'component',
  },
  hook: {
    file: '[name].ts',
    dir: 'src/hooks',
    name: 'hook',
  },
  'feature-module': {
    file: 'index.ts',
    dir: 'src/[name]',
    name: 'feature-module',
  },
};

function generatePage(name: string): string {
  const pascalName = pascalCase(name);
  const kebabName = kebabCase(name);
  const titleName = toTitleCase(name);
  
  return '' +
`'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, LoadingSpinner } from '@/components';
import { useToast } from '@/hooks';
import { PageHeader } from '@/components/PageHeader';
import { ListState } from '@/components/ListState';

interface ${pascalName}Props {
  // Add your props here based on route parameters
  // params?: { id: string };
}

export default function ${pascalName}Page(props: ${pascalName}Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<null | any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement data fetching
      console.log('Loading ${kebabName} data...');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = () => {
    // TODO: Implement action
    toast.success('Action triggered');
  };

  return (
    <div className="container-full page-padding">
      <PageHeader
        title="${titleName} Page"
        description="Manage your ${kebabName} settings"
      />

      <ListState
        {...(loading
          ? { state: 'loading' }
          : error
          ? { state: 'error', message: error.message, onRetry: fetchData }
          : data
          ? { state: 'success' }
          : { state: 'empty', message: 'No data available' })}
      >
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600 dark:text-red-400 mb-4">{error.message}</p>
            <Button onClick={fetchData}>Retry</Button>
          </div>
        ) : data ? (
          <div>
            <Button onClick={handleAction}>
              Trigger Action
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400">No ${kebabName} data available.</p>
          </div>
        )}
      </ListState>
    </div>
  );
}
`;
}

function generateApiRoute(name: string): string {
  const pascalName = pascalCase(name);
  const kebabName = kebabCase(name);
  
  return '' +
`import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, createdResponse, jsonError } from '@/lib/api-response-utils';
import { codedErrorResponse } from '@/lib/error-codes';

// GET handler
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (id) {
    // Fetch single item
    // const item = await fetch${pascalName}(id);
    // if (!item) return jsonError('${pascalName} not found', 404);
    // return successResponse({ item });
  }

  // Return list
  // const items = await list${pascalName}();
  // return successResponse({ items });

  return successResponse({ items: [] });
}

// POST handler
export const POST = withRouteErrorHandling(
  'POST /api/${kebabName}',
  async (request: Request) => {
    const body = await request.json();
    // TODO: Implement create logic
    // const newItem = await create${pascalName}(body);
    // return createdResponse({ item: newItem });

    return successResponse({}, { status: 201 });
  },
  'Failed to create ${kebabName}',
);
`;
}

function generateComponent(name: string): string {
  const pascalName = pascalCase(name);
  
  return '' +
`import { forwardRef, ReactNode, ButtonHTMLAttributes } from 'react';

export type ${pascalName}Props = ButtonHTMLAttributes<HTMLDivElement> & {
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  loading?: boolean;
  disabled?: boolean;
};

export const ${pascalName} = forwardRef<HTMLDivElement, ${pascalName}Props>(
  function ${pascalName}({
    className = '',
    children,
    'aria-label': ariaLabel,
    loading = false,
    disabled = false,
    ...props
  }, ref) {
    return (
      <div
        ref={ref}
        className={\`\${className} \${loading ? 'opacity-50 cursor-not-allowed' : ''}\`}
        aria-label={ariaLabel}
        aria-disabled={loading || disabled}
        {...props}
      >
        {children}
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </div>
    );
  }
);

export default ${pascalName};
`;
}

function generateHook(name: string): string {
  // Strip 'use-' prefix if present
  const baseName = name.startsWith('use-') ? name.slice(4) : name;
  const pascalName = pascalCase(baseName);
  const kebabName = kebabCase(baseName);
  
  return '' +
`import { useState, useEffect, useCallback } from 'react';

export function use${pascalName}(options?: {
  enabled?: boolean;
  initialData?: any;
}) {
  const [data, setData] = useState(options?.initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options?.enabled ?? true;

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // TODO: Implement fetch logic
      console.log('Fetching ${kebabName} data...');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

export default use${pascalName};
`;
}

function generateFeatureModule(name: string): string {
  const pascalName = pascalCase(name);
  const kebabName = kebabCase(name);
  const titleName = toTitleCase(name);
  
  return '' +
`/**
 * ${titleName} Feature Module
 * 
 * This module provides feature-specific utilities and React components.
 */

// Re-export components and utilities
export { ${pascalName} } from './components/${kebabName}';

// Feature-specific types
export interface ${pascalName}Config {
  enabled: boolean;
  title: string;
}

export const default${pascalName}Config: ${pascalName}Config = {
  enabled: true,
  title: '${titleName}',
};

/**
 * Feature flag check for ${titleName}
 */
export function is${pascalName}Enabled(): boolean {
  return default${pascalName}Config.enabled;
}
`;
}

function pascalCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function kebabCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.toLowerCase())
    .join('-');
}

function toTitleCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function ensureDirectoryExists(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log.step(`Created directory: ${dir}`);
  }
}

function writeFileWithDir(filePath: string, content: string): void {
  const dir = join(filePath, '..');
  ensureDirectoryExists(dir);
  writeFileSync(filePath, content, 'utf8');
}

export function scaffoldCommand(): Command {
  return new Command('scaffold')
    .description('Generate code templates for common patterns')
    .argument('<type>', 'Type of template to generate (page, api-route, component, hook, feature-module)')
    .argument('<name>', 'Name for the generated code')
    .option('--dry-run', 'Show what would be generated without writing files')
    .option('--force', 'Overwrite existing files')
    .action((type: string, name: string, options: ScaffoldOptions) => {
      const typeKey = type as keyof typeof TEMPLATE_PATTERNS;
      const pattern = TEMPLATE_PATTERNS[typeKey];
      
      if (!pattern) {
        log.error(`Unknown scaffold type: ${type}`);
        log.info('Available types: page, api-route, component, hook, feature-module');
        process.exit(1);
      }
      
      // Replace {name} and [name] in file and dir patterns
      let fileName = pattern.file.replace(/{name}/g, name).replace(/\[name\]/g, name);
      const targetDir = pattern.dir.replace(/{name}/g, name).replace(/\[name\]/g, name);
      
      // For hooks, if filename doesn't already have 'use-' prefix, add it
      if (typeKey === 'hook' && !fileName.startsWith('use-')) {
        fileName = 'use-' + fileName;
      }
      
      // Target is relative to repo root, not current directory
      const filePath = join(cwd(), 'apps/web', targetDir, fileName);
      
      // Generate content based on type
      let content: string;
      switch (typeKey) {
        case 'page':
          content = generatePage(name);
          break;
        case 'api-route':
          content = generateApiRoute(name);
          break;
        case 'component':
          content = generateComponent(name);
          break;
        case 'hook':
          content = generateHook(name);
          break;
        case 'feature-module':
          content = generateFeatureModule(name);
          break;
        default:
          throw new Error(`Unknown type: ${typeKey}`);
      }
      
      console.log(chalk.bold(`\n📦 Scaffold: ${type} → ${name}\n`));
      
      if (existsSync(filePath) && !options.force) {
        log.error(`File already exists: ${filePath}`);
        log.info('Use --force to overwrite');
        process.exit(1);
      }
      
      if (options.dryRun) {
        console.log(chalk.gray(`Would create: ${filePath}`));
        console.log(chalk.gray('Content preview:'));
        console.log(chalk.gray('---'));
        console.log(content.slice(0, 500) + (content.length > 500 ? '\n...' : ''));
        console.log(chalk.gray('---'));
        return;
      }
      
      writeFileWithDir(filePath, content);
      log.success(`Created: ${filePath}`);
      
      console.log(chalk.gray(`\nNext steps:`));
      console.log(chalk.gray(`  1. pnpm --dir apps/web run lint  # Run linter`));
      console.log(chalk.gray(`  2. pnpm --dir apps/web run typecheck  # Check types`));
      console.log(chalk.gray(`  3. git add . && git commit -m "feat: add ${type} ${name}"\n`));
    });
}