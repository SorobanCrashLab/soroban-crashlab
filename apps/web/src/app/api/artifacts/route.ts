/**
 * API Routes for Artifact Storage Integration
 *
 * POST /api/artifacts - Upload a new artifact
 * GET /api/artifacts - List all stored artifacts
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for demonstration purposes
// In production, this would connect to the Rust backend or cloud storage
const artifactStore: Map<string, {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  buffer: Buffer;
}> = new Map();

/**
 * POST /api/artifacts
 * Uploads a new artifact to storage
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    // Generate artifact ID
    const artifactId = `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Store metadata
    const metadata = {
      id: artifactId,
      name: file.name,
      createdAt: new Date().toISOString(),
      sizeBytes: buffer.length,
      buffer,
    };

    artifactStore.set(artifactId, metadata);

    return NextResponse.json({
      id: metadata.id,
      name: metadata.name,
      createdAt: metadata.createdAt,
      sizeBytes: metadata.sizeBytes,
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload artifact:', error);
    return NextResponse.json(
      { error: 'Failed to upload artifact' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/artifacts
 * Lists all stored artifacts
 */
export async function GET() {
  try {
    const artifacts = Array.from(artifactStore.values()).map(art => ({
      id: art.id,
      name: art.name,
      createdAt: art.createdAt,
      sizeBytes: art.sizeBytes,
    }));

    // Sort by creation date, newest first
    artifacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      artifacts,
      total: artifacts.length,
    });
  } catch (error) {
    console.error('Failed to list artifacts:', error);
    return NextResponse.json(
      { error: 'Failed to list artifacts' },
      { status: 500 }
    );
  }
}
