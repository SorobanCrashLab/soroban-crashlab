/**
 * Pattern Catalog - A searchable catalog of existing code patterns, utilities, and conventions.
 * 
 * This data powers the Pattern Catalog page in the dev tools section.
 * Each pattern includes information about its purpose, file location, and template.
 */

export interface CodePattern {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  filePath: string;
  generatorType?: string;
  templateFile?: string;
  exampleCode?: string;
}

export const codePatterns: CodePattern[] = [
  {
    id: 'page-component',
    name: 'Page Component',
    description: 'Next.js page with loading states, error handling, and SEO metadata.',
    category: 'UI',
    tags: ['page', 'layout', 'seo'],
    filePath: 'apps/web/src/app/[page]/page.tsx',
    generatorType: 'page',
    exampleCode: `export default function DashboardPage() {
  return (
    <div className="container-full page-padding">
      <h1>Dashboard</h1>
      <ListState state="success">{/* Content */}</ListState>
    </div>
  );
}`,
  },
  {
    id: 'api-route',
    name: 'API Route',
    description: 'Next.js API route with error handling, validation, and proper HTTP methods.',
    category: 'Backend',
    tags: ['api', 'route', 'server'],
    filePath: 'apps/web/src/app/api/[resource]/route.ts',
    generatorType: 'api-route',
    exampleCode: `export const GET = withRouteErrorHandling(
  'GET /api/runs',
  async () => {
    const runs = await fetchRuns();
    return successResponse({ runs });
  },
  'Failed to fetch runs',
);`,
  },
  {
    id: 'component',
    name: 'UI Component',
    description: 'React component with proper TypeScript types, forwardRef, and accessibility.',
    category: 'UI',
    tags: ['component', 'react', 'a11y'],
    filePath: 'apps/web/src/components/[name]/index.tsx',
    generatorType: 'component',
    exampleCode: `export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = 'primary', children, ...props }, ref) {
    return (
      <button ref={ref} className={getVariantClass(variant)} {...props}>
        {children}
      </button>
    );
  }
);`,
  },
  {
    id: 'custom-hook',
    name: 'Custom Hook',
    description: 'React hook with TypeScript types, cleanup, and proper error handling.',
    category: 'Logic',
    tags: ['hook', 'react', 'state'],
    filePath: 'apps/web/src/hooks/use[name].ts',
    generatorType: 'hook',
    exampleCode: `export function useApiData(url: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [url]);

  return { data, loading, error, refetch: fetchData };
}`,
  },
  {
    id: 'zod-schema',
    name: 'Zod Schema',
    description: 'Zod validation schema for API request/response validation.',
    category: 'Backend',
    tags: ['validation', 'schema', 'types'],
    filePath: 'apps/web/src/lib/schemas/[name].ts',
    exampleCode: `export const CreateRunSchema = z.object({
  contractId: z.string().uuid(),
  functionName: z.string().min(1),
  seedCount: z.number().int().min(1).max(10000),
  options: z.object({
    timeout: z.number().optional(),
  }),
});`,
  },
  {
    id: 'storage-driver',
    name: 'Storage Driver',
    description: 'Abstraction layer for data persistence with in-memory, Redis, and other adapters.',
    category: 'Backend',
    tags: ['storage', 'adapter', 'persistence'],
    filePath: 'apps/web/src/lib/storage/[driver].ts',
    exampleCode: `export class RedisRunDriver implements RunDriver {
  async put(run: FuzzingRun): Promise<void> {
    await redis.set(\`run:${run.id}\`, JSON.stringify(run));
  }
  
  async get(id: string): Promise<FuzzingRun | null> {
    const raw = await redis.get(\`run:${id}\`);
    return raw ? JSON.parse(raw) : null;
  }
}`,
  },
  {
    id: 'error-handler',
    name: 'Error Handler',
    description: 'Central error handling with proper logging, user feedback, and error codes.',
    category: 'Backend',
    tags: ['error', 'logging', 'handler'],
    filePath: 'apps/web/src/lib/route-handler.ts',
    exampleCode: `export const withRouteErrorHandling = 
  (route: string, handler: RouteHandler, errorMessage: string) =>
  async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      logger.error({ error, route }, errorMessage);
      return jsonError(errorMessage, 500);
    }
  };`,
  },
  {
    id: 'api-response',
    name: 'API Response Utils',
    description: 'Standardized response helpers for success, error, and pagination.',
    category: 'Backend',
    tags: ['api', 'response', 'utils'],
    filePath: 'apps/web/src/lib/api-response-utils.ts',
    exampleCode: `export function successResponse<T>(data: T, metadata?: Record<string, unknown>) {
  return Response.json({ data, metadata }, { status: 200 });
}

export function createdResponse<T>(data: T, metadata?: Record<string, unknown>) {
  return Response.json({ data, metadata }, { status: 201 });
}`,
  },
  {
    id: 'state-management',
    name: 'State Management Pattern',
    description: 'Pattern for managing complex state with useReducer and proper types.',
    category: 'Logic',
    tags: ['state', 'redux', 'useReducer'],
    filePath: 'apps/web/src/app/[feature]/selection-store.ts',
    exampleCode: `export type SelectionMode = 'multiple' | 'single' | 'all-matching';

export interface SelectionState {
  mode: SelectionMode;
  selectedIds: Set<string>;
  matchingCount?: number;
}

export function createSelectionState(): SelectionState {
  return { mode: 'multiple', selectedIds: new Set() };
}`,
  },
  {
    id: 'webhook-handler',
    name: 'Webhook Handler',
    description: 'Secure webhook handler with signature verification and retry logic.',
    category: 'Backend',
    tags: ['webhook', 'integration', 'security'],
    filePath: 'apps/web/src/app/api/webhooks/[name]/route.ts',
    exampleCode: `export const POST = withRouteErrorHandling(
  'POST /api/webhooks/github',
  async (request: Request) => {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    
    if (!verifySignature(body, signature, process.env.WEBHOOK_SECRET)) {
      return jsonError('Invalid signature', 401);
    }
    
    await processWebhook(JSON.parse(body));
    return successResponse({ received: true });
  },
  'Failed to process webhook',
);`,
  },
  {
    id: 'feature-toggle',
    name: 'Feature Toggle',
    description: 'Feature flag pattern for gradual rollouts and A/B testing.',
    category: 'Logic',
    tags: ['feature', 'toggle', 'flag'],
    filePath: 'apps/web/src/lib/flags.ts',
    exampleCode: `export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const enabled = process.env.NEXT_PUBLIC_FEATURE_${flag};
  return enabled === 'true' || enabled === '1';
}

export const FeatureFlags = {
  NEW_DASHBOARD: 'NEW_DASHBOARD',
  WEBHOOK_RETRY: 'WEBHOOK_RETRY',
} as const;`,
  },
  {
    id: 'rbac',
    name: 'RBAC Permission System',
    description: 'Role-based access control with fine-grained permissions.',
    category: 'Backend',
    tags: ['security', 'rbac', 'permissions'],
    filePath: 'apps/web/src/lib/rbac.ts',
    exampleCode: `export function canPerformAction(
  principal: Principal,
  action: string,
  resource: string
): boolean {
  const policy = getPolicyForPrincipal(principal);
  return policy.check(action, resource);
}

export const RolePermissions = {
  admin: ['read', 'write', 'delete', 'admin'],
  editor: ['read', 'write'],
  viewer: ['read'],
} as const;`,
  },
  {
    id: 'structured-logging',
    name: 'Structured Logging',
    description: 'Consistent logging pattern with correlation IDs and structured output.',
    category: 'Backend',
    tags: ['logging', 'observability'],
    filePath: 'apps/web/src/lib/logger.ts',
    exampleCode: `export const logger = createLogger({
  name: 'crashlab',
  level: process.env.LOG_LEVEL || 'info',
  handlers: [consoleHandler],
});

// Usage
logger.info({ userId, runId }, 'Run completed successfully');
logger.error({ error }, 'Failed to process run');`,
  },
  {
    id: 'testing-pattern',
    name: 'Testing Pattern',
    description: 'Vitest test file with mocks, setup, and assertions following project conventions.',
    category: 'Testing',
    tags: ['test', 'vitest', 'unit'],
    filePath: 'apps/web/src/[name].test.ts',
    exampleCode: `describe('useRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch runs successfully', async () => {
    const mockRuns = [{ id: '1', status: 'completed' }];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ runs: mockRuns }),
    });

    const { result } = renderHook(() => useRuns());
    
    expect(result.current.runs).toEqual(mockRuns);
    expect(result.current.loading).toBe(false);
  });
});`,
  },
  {
    id: 'react-query-pattern',
    name: 'React Query Pattern',
    description: 'Custom hook using React Query for API data fetching with caching.',
    category: 'Logic',
    tags: ['query', 'cache', 'network'],
    filePath: 'apps/web/src/hooks/useRemoteQuery.ts',
    exampleCode: `export function useRemoteQuery<T>(queryKey: string, fetcher: () => Promise<T>) {
  return useQuery({
    queryKey: [queryKey],
    queryFn: fetcher,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
  });
}`,
  },
  {
    id: 'type-guards',
    name: 'Type Guards',
    description: 'Runtime type validation functions for TypeScript.',
    category: 'Logic',
    tags: ['types', 'validation', 'runtime'],
    filePath: 'apps/web/src/lib/type-guards.ts',
    exampleCode: `export function isFuzzingRun(value: unknown): value is FuzzingRun {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'status' in value &&
    'createdAt' in value
  );
}`,
  },
];

export const categories = [
  { id: 'UI', name: 'UI Components', icon: 'ChartBarIcon' },
  { id: 'Backend', name: 'Backend', icon: 'CogIcon' },
  { id: 'Logic', name: 'Logic', icon: 'LightBulbIcon' },
  { id: 'Testing', name: 'Testing', icon: 'Square2StackIcon' },
  { id: 'Security', name: 'Security', icon: 'ShieldCheckIcon' },
  { id: 'Integration', name: 'Integration', icon: 'LinkIcon' },
];

export type CategoryId = typeof categories[number]['id'];