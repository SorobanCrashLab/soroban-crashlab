import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { isRedisConfigured, getRedis } from '@/lib/redis';

export const GET = withRouteErrorHandling(
  'GET /api/artifacts',
  async () => {
    if (isRedisConfigured()) {
      const redis = getRedis();
      const ids = await redis.smembers('artifact:index');
      const artifacts = [];
      for (const id of ids) {
        const raw = await redis.get(`artifact:${id}`);
        if (raw) artifacts.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
      artifacts.sort(
        (a: { updatedAt: string }, b: { updatedAt: string }) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      return successResponse({ artifacts, total: artifacts.length }, { total: artifacts.length });
    }

    const artifacts = await selectArtifactRepository().list();
    const response = successResponse({ artifacts, total: artifacts.length }, { total: artifacts.length });
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
