import { NextResponse } from 'next/server';
import { listArtifactMetadata, saveArtifact } from '@/lib/artifact-fs-adapter';
import { logger } from '@/lib/logger';

/**
 * GET /api/artifacts
 * Lists all artifacts from CRASHLAB_ARTIFACT_DIR
 */
export async function GET() {
  try {
    const artifacts = await listArtifactMetadata();

    return NextResponse.json({
      artifacts,
      total: artifacts.length,
    });
  } catch (error) {
    logger.error('GET /api/artifacts failed', { error });
    return NextResponse.json(
      { error: 'Failed to list artifacts' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/artifacts
 * Stores an uploaded artifact in CRASHLAB_ARTIFACT_DIR (or temp dir).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await saveArtifact(file.name, buffer);
    return NextResponse.json(metadata, { status: 201 });
  } catch (error) {
    logger.error('POST /api/artifacts failed', { error });
    return NextResponse.json(
      { error: 'Failed to upload artifact' },
      { status: 500 },
    );
  }
}
