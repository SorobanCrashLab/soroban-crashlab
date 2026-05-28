import { NextRequest, NextResponse } from 'next/server';
import {
  getArtifactById,
  deleteArtifactById,
} from '@/lib/artifact-fs-adapter';

/**
 * GET /api/artifacts/[id]
 * Downloads an artifact from CRASHLAB_ARTIFACT_DIR by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Artifact ID is required' },
        { status: 400 },
      );
    }

    const result = await getArtifactById(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 },
      );
    }

    const { metadata, buffer } = result;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${metadata.name}"`,
        'Content-Length': metadata.sizeBytes.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to download artifact:', error);
    return NextResponse.json(
      { error: 'Failed to download artifact' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/artifacts/[id]
 * Deletes an artifact from CRASHLAB_ARTIFACT_DIR by ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Artifact ID is required' },
        { status: 400 },
      );
    }

    const deleted = await deleteArtifactById(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Artifact deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete artifact:', error);
    return NextResponse.json(
      { error: 'Failed to delete artifact' },
      { status: 500 },
    );
  }
}
