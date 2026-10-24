import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { codedErrorResponse } from '@/lib/error-codes';
import { isRedisConfigured, getRedis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import {
  CursorMismatchError,
  computeCursorScope,
  getArtifactKeyset,
  paginateKeyset,
} from '@/app/pagination-utils';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export const GET = withRouteErrorHandling(
  'GET /api/artifacts',
  async (request?: Request) => {
    const { searchParams } = new URL(request?.url ?? 'http://localhost/api/artifacts');

    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT;
    const cursor = searchParams.get('cursor') ?? undefined;

    let artifacts: Array<{ id: string; name?: string; createdAt?: string; updatedAt?: string; sizeBytes?: number }> = [];
    if (isRedisConfigured()) {
      const redis = getRedis();
      const ids = await redis.smembers('artifact:index');
      for (const id of ids) {
        const raw = await redis.get(`artifact:${id}`);
        if (raw) artifacts.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    } else {
      artifacts = await selectArtifactRepository().list();
    }

    // Keyset pagination on (updatedAt|createdAt, id) with a mandatory id
    // tiebreaker, so timestamp ties can never reorder between pages (#1834).
    const cursorScope = computeCursorScope({ route: 'artifacts', sort: 'updatedAt:desc' });
    let paginated;
    try {
      paginated = paginateKeyset(artifacts, {
        cursor,
        limit,
        getItemKeyset: getArtifactKeyset,
        direction: 'desc',
        scope: cursorScope,
        onLegacyCursor: (offending) => {
          logger.warn('GET /api/artifacts: legacy or invalid cursor supplied, resetting to page 1', {
            cursor: offending,
          });
        },
      });
    } catch (error) {
      if (error instanceof CursorMismatchError) {
        logger.warn('GET /api/artifacts: cursor rejected (sort/filter mismatch)', {
          error: error.message,
        });
        return codedErrorResponse('CURSOR_MISMATCH');
      }
      throw error;
    }

    const response = successResponse(
      {
        artifacts: paginated.items,
        total: paginated.total,
        nextCursor: paginated.nextCursor,
        hasMore: paginated.hasMore,
      },
      { total: paginated.total },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
  'Failed to list artifacts',
);

export const POST = withRouteErrorHandling(
  'POST /api/artifacts',
  async (request: Request) => {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonError('file is required', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await selectArtifactRepository().put(file.name, buffer);
    return createdResponse({ artifact: metadata });
  },
  'Failed to upload artifact',
);
