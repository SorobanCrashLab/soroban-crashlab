import { NextResponse } from 'next/server';
import { listArtifactMetadata, saveArtifact } from '@/lib/artifact-fs-adapter';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';

/**
 * GET /api/artifacts
 * Lists all artifacts from CRASHLAB_ARTIFACT_DIR
 */
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

/**
 * POST /api/artifacts
 * Stores an uploaded artifact in CRASHLAB_ARTIFACT_DIR (or temp dir).
 */
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
    return NextResponse.json(metadata, { status: 201 });
  },
  'Failed to upload artifact',
);
