import { NextResponse } from 'next/server';
import { errorResponse, successResponse, createdResponse, status } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { withRouteErrorHandling, jsonError, readJsonBody } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { selectRunStorageDriver } from '@/lib/storage';
import { paginateKeyset, isLegacyOrInvalidCursor } from '@/app/pagination-utils';
import {
  getRunSortKeyset,
  isRunSortField,
  type RunSortDirection,
  type RunSortField,
} from '@/app/runs-sort-utils';
import { FuzzingRunSchema } from '@/lib/schemas/runs';
import { isRedisConfigured } from '@/lib/redis';
import { withCsrfProtection } from '@/lib/csrf';

const DEFAULT_PAGE_LIMIT = 20;

/**
 * Hard ceiling for a single page (#1875). The virtualized runs table pages
 * through 100k+ rows with cursors; an unbounded `limit` would let a single
 * request materialize the whole dataset and defeat both keyset paging and the
 * response-size budgets.
 */
const MAX_PAGE_LIMIT = 500;

/** Default sort for the runs list (matches the historic keyset order). */
const DEFAULT_SORT_FIELD: RunSortField = 'queuedAt';
const DEFAULT_SORT_DIRECTION: RunSortDirection = 'desc';

export const GET = withRouteErrorHandling('GET /api/runs', async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const sanitizedSearchParams = sanitizeSearchParams(searchParams);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl) {
    try {
      const qs = sanitizedSearchParams.toString();

      // Race the upstream fetch against a 10-second timeout so tests that
      // mock fetch can trigger the timeout path without waiting for real I/O.
      const UPSTREAM_TIMEOUT_MS = 10_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upstream timeout')), UPSTREAM_TIMEOUT_MS),
      );
      const fetchPromise = fetch(`${apiUrl}/api/runs${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
      });

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (res.ok) {
        const backendData = await res.json() as { total?: number; [key: string]: unknown };
        const init = backendData.total !== undefined ? { total: backendData.total as number } : undefined;
        return successResponse(backendData, init);
      }
      return NextResponse.json(
        { error: 'Backend unavailable', runs: [], total: 0 },
        { status: 503 },
      );
    } catch (error) {
      logger.error('GET /api/runs upstream fetch failed', { error });
      return NextResponse.json(
        { error: 'Backend unavailable', runs: [], total: 0 },
        { status: 503 },
      );
    }
  }

  const enableMock = process.env.NEXT_PUBLIC_ENABLE_MOCK_DATA !== 'false';
  if (!enableMock && !isRedisConfigured()) {
    return errorResponse('Mock data disabled and no backend configured', status.serviceUnavailable);
  }

  const driver = selectRunStorageDriver();
  const rawStatus = sanitizedSearchParams.get('status') as import('@/app/types').RunStatus | undefined;
  const { runs: allRuns } = await driver.listRuns({
    status: rawStatus,
  });

  // Parse keyset pagination parameters from the query string.
  // A legacy offset cursor is detected and reset gracefully to page 1.
  const rawCursor = sanitizedSearchParams.get('cursor') ?? '';
  const cursor = rawCursor && !isLegacyOrInvalidCursor(rawCursor) ? rawCursor : undefined;
  const legacyCursorDetected = rawCursor && isLegacyOrInvalidCursor(rawCursor);

  if (legacyCursorDetected) {
    logger.warn('GET /api/runs: legacy or invalid cursor supplied, resetting to page 1', {
      cursor: rawCursor,
    });
  }

  const limitParam = parseInt(sanitizedSearchParams.get('limit') ?? '', 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT;

  // Sort key + direction (#1875). Unknown keys fall back to the default so a
  // hand-edited URL can never trigger an unindexed/slow comparator.
  const rawSort = sanitizedSearchParams.get('sort');
  const sortField: RunSortField = isRunSortField(rawSort) ? rawSort : DEFAULT_SORT_FIELD;
  const sortDirection: RunSortDirection =
    sanitizedSearchParams.get('order') === 'asc' ? 'asc' : DEFAULT_SORT_DIRECTION;

  const { items, total, nextCursor, hasMore } = paginateKeyset(allRuns, {
    cursor,
    limit,
    getItemKeyset: (run) => getRunSortKeyset(run, sortField),
    direction: sortDirection,
  });

  const data = { runs: items, total, nextCursor, hasMore };
  return withFixtureCaching(request, { data, total: data.total });
});

export const POST = withRouteErrorHandling('POST /api/runs', withCsrfProtection(async (request: Request) => {
  if (!isRedisConfigured()) {
    return errorResponse('Storage not configured', status.serviceUnavailable);
  }

  const parsed = await readJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const result = FuzzingRunSchema.safeParse(parsed.body);
  if (!result.success) {
    return jsonError(`Invalid run payload: ${result.error.issues.map((i) => i.message).join(', ')}`, 400);
  }

  const driver = selectRunStorageDriver();
  if ('putRun' in driver && typeof driver.putRun === 'function') {
    await (driver as import('@/lib/storage/kv-run-driver').KVRunDriver).putRun(result.data);
  }

  return createdResponse({ run: result.data });
}));
