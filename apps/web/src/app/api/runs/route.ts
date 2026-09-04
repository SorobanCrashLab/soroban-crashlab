import { NextResponse } from 'next/server';
import { errorResponse, successResponse, status } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { selectRunStorageDriver } from '@/lib/storage';
import { paginateKeyset, getRunKeyset, isLegacyOrInvalidCursor } from '@/app/pagination-utils';

const DEFAULT_PAGE_LIMIT = 20;

export const GET = withRouteErrorHandling('GET /api/runs', async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl) {
    try {
      const sanitizedSearchParams = sanitizeSearchParams(searchParams);
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
  if (!enableMock) {
    return errorResponse('Mock data disabled and no backend configured', status.serviceUnavailable);
  }

  const driver = selectRunStorageDriver();
  const rawStatus = searchParams.get('status') as import('@/app/types').RunStatus | undefined;
  const { runs: allRuns } = await driver.listRuns({
    status: rawStatus,
  });

  // Parse keyset pagination parameters from the query string.
  // A legacy offset cursor is detected and reset gracefully to page 1.
  const rawCursor = searchParams.get('cursor') ?? '';
  const cursor = rawCursor && !isLegacyOrInvalidCursor(rawCursor) ? rawCursor : undefined;
  const legacyCursorDetected = rawCursor && isLegacyOrInvalidCursor(rawCursor);

  if (legacyCursorDetected) {
    logger.warn('GET /api/runs: legacy or invalid cursor supplied, resetting to page 1', {
      cursor: rawCursor,
    });
  }

  const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_PAGE_LIMIT;

  const { items, total, nextCursor, hasMore } = paginateKeyset(allRuns, {
    cursor,
    limit,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });

  const data = { runs: items, total, nextCursor, hasMore };
  return withFixtureCaching(request, { data, total: data.total });
});
