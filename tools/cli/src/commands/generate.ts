import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';

interface GenerateOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

const GENERATORS = {
  page: {
    description: 'Generate a Next.js page component',
    template: `
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, LoadingSpinner } from '@/components';
import { useToast } from '@/hooks';
import { PageHeader } from '@/components/PageHeader';
import { ListState } from '@/components/ListState';

interface $PascalCasePageProps {
  // Add your props here based on route parameters
  // params?: { id: string };
}

export default function $PascalCasePage(props: $PascalCasePageProps) {
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
      console.log('Loading $KebabCase data...');
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
        title="$TitleCase Page"
        description="Manage your $KebabCase settings"
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
            <p className="text-gray-600 dark:text-gray-400">No $KebabCase data available.</p>
          </div>
        )}
      </ListState>
    </div>
  );
}
`,
    filePattern: 'app/[name]/page.tsx',
  },
  'api-route': {
    description: 'Generate a Next.js API route',
    template: `
import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, createdResponse, jsonError } from '@/lib/api-response-utils';
import { codedErrorResponse } from '@/lib/error-codes';

// GET handler
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (id) {
    // Fetch single item
    // const item = await fetch$PascalCase(id);
    // if (!item) return jsonError('$PascalCase not found', 404);
    // return successResponse({ item });
  }

  // Return list
  // const items = await list$PascalCase();
  // return successResponse({ items });

  return successResponse({ items: [] });
}

// POST handler
export const POST = withRouteErrorHandling(
  'POST /api/$KebabCase',
  async (request: Request) => {
    const body = await request.json();
    // TODO: Implement create logic
    // const newItem = await create$PascalCase(body);
    // return createdResponse({ item: newItem });

    return successResponse({}, { status: 201 });
  },
  'Failed to create $KebabCase',
);
`,
    filePattern: 'app/api/[name]/route.ts',
  },
  component: {
    description: 'Generate a React component',
    template: `
import { forwardRef, ReactNode, ButtonHTMLAttributes } from 'react';

export type $PascalCaseProps = ButtonHTMLAttributes<HTMLDivElement> & {
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  loading?: boolean;
  disabled?: boolean;
};

export const $PascalCase = forwardRef<HTMLDivElement, $PascalCaseProps>(
  function $PascalCase({
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
        className={\`$\{className\} $\{loading ? 'opacity-50 cursor-not-allowed' : ''\}\`}
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

export default $PascalCase;
`,
    filePattern: 'src/components/[name]/index.tsx',
  },
  hook: {
    description: 'Generate a custom React hook',
    template: `
import { useState, useEffect, useCallback } from 'react';

export function use$PascalCase(options?: {
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
      console.log('Fetching $KebabCase data...');
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

export default use$PascalCase;
`,
    filePattern: 'src/hooks/[name].ts',
  },
  integration: {
    description: 'Generate an integration module',
    template: `
import { logger } from '@/lib/logger';

export interface $PascalCaseConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
}

export async function sendTo$PascalCase(
  payload: Record<string, unknown>,
  config: $PascalCaseConfig
): Promise<boolean> {
  if (!config.enabled) {
    logger.debug('\`$PascalCase integration is disabled');
    return true;
  }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: \`Bearer $\{config.apiKey\}\`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error('Integration request failed', {
        status: response.status,
        endpoint: config.endpoint,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Integration request error', { error });
    return false;
  }
}

export function validate$PascalCaseConfig(config: Partial<$PascalCaseConfig>): boolean {
  return Boolean(config.apiKey && config.endpoint && config.enabled);
}
`,
    filePattern: 'src/lib/integrations/[name].ts',
  },
  webhook: {
    description: 'Generate a webhook handler',
    template: `
import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, jsonError } from '@/lib/api-response-utils';

const SIGNATURE_HEADER = 'x-$KebabCase-signature';

function verifySignature(request: NextRequest, secret: string): boolean {
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) return false;

  // TODO: Implement signature verification
  return false;
}

export const POST = withRouteErrorHandling(
  'POST /api/webhooks/$KebabCase',
  async (request: NextRequest) => {
    // TODO: Implement webhook handler
    // Get secret from environment
    const secretKey = '$KebabCase'.toUpperCase().replace(/-/g, '_');
    const secret = process.env['WEBHOOK_SECRET_' + secretKey];
    
    if (!secret) {
      return jsonError('Webhook secret not configured', 500);
    }

    // Verify signature
    // if (!verifySignature(request, secret)) {
    //   return jsonError('Invalid signature', 401);
    // }

    // Parse payload
    // const payload = await request.json();
    // await handleWebhookPayload(payload);
    
    return successResponse({ received: true });
  },
  'Failed to process webhook',
);
`,
    filePattern: 'app/api/webhooks/[name]/route.ts',
  },
  test: {
    description: 'Generate a test file',
    template: `
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('$TitleCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work correctly', () => {
    // TODO: Add your test
    expect(true).toBe(true);
  });

  it('should handle edge cases', () => {
    // Test edge cases
    expect(false).toBe(false);
  });
});
`,
    filePattern: '[name].test.ts',
  },
};

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

function titleCase(str: string): string {
  return str
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function applyTemplate(templateStr: string, name: string, type?: string): string {
  let processName = name;
  
  // For hooks, strip the 'use-' prefix if present
  if (type === 'hook' && name.startsWith('use-')) {
    processName = name.slice(4);
  }
  
  const p = pascalCase(processName);
  const k = kebabCase(processName);
  const t = titleCase(processName);
  
  return templateStr
    .replace(/\$PascalCase/g, p)
    .replace(/\$KebabCase/g, k)
    .replace(/\$TitleCase/g, t);
}

function resolveTargetPath(pattern: string, name: string, type?: string): string {
  const appDir = join(cwd(), 'apps/web');
  // For hooks, add 'use-' prefix to the filename if not already present
  let processedName = name;
  if (type === 'hook' && !name.startsWith('use-')) {
    processedName = 'use-' + name;
  }
  const basePath = pattern.replace('[name]', processedName);
  return join(appDir, basePath);
}

function ensureDirectoryExists(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log.step(`Created directory: ${dir}`);
  }
}

export function generateCommand(): Command {
  return new Command('generate')
    .description('Generate code from templates')
    .argument('<type>', 'Type of code to generate')
    .argument('<name>', 'Name for the generated code')
    .option('--dry-run', 'Show what would be generated without writing files')
    .option('--force', 'Overwrite existing files')
    .action((type: string, name: string, options: GenerateOptions) => {
      const generator = GENERATORS[type as keyof typeof GENERATORS];
      
      if (!generator) {
        log.error(`Unknown generator type: ${type}`);
        log.info('Available types: ' + Object.keys(GENERATORS).join(', '));
        process.exit(1);
      }
      
      const content = applyTemplate(generator.template, name, type);
      const targetPath = resolveTargetPath(generator.filePattern, name, type);
      const targetDir = join(targetPath, '..');
      
      console.log(chalk.bold(`\n✨ Generate: ${type} → ${name}\n`));
      
      if (existsSync(targetPath) && !options.force) {
        log.error(`File already exists: ${targetPath}`);
        log.info('Use --force to overwrite');
        process.exit(1);
      }
      
      if (options.dryRun) {
        console.log(chalk.gray(`Would create: ${targetPath}`));
        console.log(chalk.gray('Content preview:'));
        console.log(chalk.gray('---'));
        const preview = content.slice(0, 800);
        console.log(preview + (content.length > 800 ? '\n...' : ''));
        console.log(chalk.gray('---'));
        return;
      }
      
      ensureDirectoryExists(targetDir);
      writeFileSync(targetPath, content, 'utf8');
      log.success(`Created: ${targetPath}`);
      
      console.log(chalk.gray(`\nNext steps:`));
      console.log(chalk.gray(`  1. pnpm --dir apps/web run lint  # Run linter`));
      console.log(chalk.gray(`  2. pnpm --dir apps/web run test  # Run tests`));
      console.log(chalk.gray(`  3. git add . && git commit -m "feat: add ${type} ${name}"\n`));
    });
}