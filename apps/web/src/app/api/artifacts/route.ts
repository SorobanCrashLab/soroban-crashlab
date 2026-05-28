import { NextRequest, NextResponse } from 'next/server';
import { listArtifactMetadata } from '@/lib/artifact-fs-adapter';

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
    console.error('Failed to list artifacts:', error);
    return NextResponse.json(
      { error: 'Failed to list artifacts' },
      { status: 500 },
    );
  }
}
