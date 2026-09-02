import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { createdResponse, successResponse } from '@/lib/api-response-utils';

export const GET = withRouteErrorHandling(
  'GET /api/artifacts',
  async () => {
    const artifacts = await selectArtifactRepository().list();
    return successResponse({ artifacts, total: artifacts.length }, { total: artifacts.length });
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
