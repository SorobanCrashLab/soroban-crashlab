import { NextResponse } from 'next/server';
import { errorResponse, successResponse, status } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { selectRunStorageDriver } from '@/lib/storage';

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
  const { runs, total } = await driver.listRuns({
    status: searchParams.get('status') as import('@/app/types').RunStatus | undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
  });
  const data = { runs, total };
  return withFixtureCaching(request, { data, total: data.total });
});
