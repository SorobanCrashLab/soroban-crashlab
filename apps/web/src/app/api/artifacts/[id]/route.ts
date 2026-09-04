import { NextRequest, NextResponse } from 'next/server';
import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { recordAuditEvent } from '@/lib/audit/audit-sink';

export const GET = withRouteErrorHandling(
  'GET /api/artifacts/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return jsonError('Artifact ID is required', 400);
    }

    const result = await selectArtifactRepository().get(id);

    if (!result) {
      return jsonError('Artifact not found', 404);
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
  },
  'Failed to download artifact',
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/artifacts/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return jsonError('Artifact ID is required', 400);
    }

    const deleted = await selectArtifactRepository().delete(id);

    if (!deleted) {
      return jsonError('Artifact not found', 404);
    }

    recordAuditEvent({ action: 'artifact.delete', target: id });

    return successResponse({
      success: true,
      message: 'Artifact deleted successfully',
    });
  },
  'Failed to delete artifact',
);
