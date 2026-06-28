import { NextResponse } from 'next/server';
import { listArtifactMetadata, saveArtifact } from '@/lib/artifact-fs-adapter';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { createdResponse } from '@/lib/api-response-utils';

export const GET = withRouteErrorHandling(
  'GET /api/artifacts',
  async () => {
    const artifacts = await listArtifactMetadata();
    return NextResponse.json({
      artifacts,
      total: artifacts.length,
    });
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
    const metadata = await saveArtifact(file.name, buffer);
    return createdResponse({ artifact: metadata });
  },
  'Failed to upload artifact',
);
