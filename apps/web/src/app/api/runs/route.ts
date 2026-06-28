import { NextResponse } from 'next/server';
import { errorResponse, successResponse, status } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';

export const GET = withRouteErrorHandling('GET /api/runs', async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl) {
    try {
      const sanitizedSearchParams = sanitizeSearchParams(searchParams);
      const qs = sanitizedSearchParams.toString();
      const res = await fetch(`${apiUrl}/api/runs${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return successResponse(data);
      }
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

  const { buildMockRuns } = await import('@/app/mockRuns');
  const runs = buildMockRuns();
  return successResponse({ runs }, { total: runs.length });
});
