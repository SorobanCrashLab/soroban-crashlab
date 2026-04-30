/**
 * API Route for Individual Artifact Operations
 *
 * GET /api/artifacts/[id] - Download an artifact
 * DELETE /api/artifacts/[id] - Delete an artifact
 */

import { NextRequest, NextResponse } from 'next/server';

// Reference to the same in-memory store from parent route
// In production, this would be a proper database or service
const artifactStore: Map<string, {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  buffer: Buffer;
}> = new Map();

/**
 * GET /api/artifacts/[id]
 * Downloads an artifact by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Artifact ID is required' },
        { status: 400 }
      );
    }

    // Validate ID format (path traversal prevention)
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid artifact ID' },
        { status: 400 }
      );
    }

    const artifact = artifactStore.get(id);

    if (!artifact) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      );
    }

    // Return the artifact as a download
    return new NextResponse(artifact.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${artifact.name}"`,
        'Content-Length': artifact.sizeBytes.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to download artifact:', error);
    return NextResponse.json(
      { error: 'Failed to download artifact' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/artifacts/[id]
 * Deletes an artifact by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Artifact ID is required' },
        { status: 400 }
      );
    }

    // Validate ID format (path traversal prevention)
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid artifact ID' },
        { status: 400 }
      );
    }

    const existed = artifactStore.has(id);

    if (!existed) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      );
    }

    artifactStore.delete(id);

    return NextResponse.json({
      success: true,
      message: 'Artifact deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete artifact:', error);
    return NextResponse.json(
      { error: 'Failed to delete artifact' },
      { status: 500 }
    );
  }
}
