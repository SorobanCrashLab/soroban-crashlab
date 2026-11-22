import { NextRequest, NextResponse } from 'next/server';
import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { recordAuditEvent } from '@/lib/audit/audit-sink';
import { isRedisConfigured, getRedis } from '@/lib/redis';

export const GET = withRouteErrorHandling(
  'GET /api/artifacts/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return jsonError('Artifact ID is required', 400);
    }

    if (isRedisConfigured()) {
      const redis = getRedis();
      const raw = await redis.get(`artifact:${id}`);
      if (!raw) return jsonError('Artifact not found', 404);

      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (record.utUrl) {
        return NextResponse.redirect(record.utUrl);
      }
      return jsonError('Artifact has no download URL', 404);
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
        'Cache-Control': 'public, max-age=31536000, immutable',
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

    if (isRedisConfigured()) {
      const redis = getRedis();
      const raw = await redis.get(`artifact:${id}`);
      if (!raw) return jsonError('Artifact not found', 404);

      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (record.runId) {
        await redis.srem(`artifact:run:${record.runId}`, id);
      }
      await redis.srem('artifact:index', id);
      await redis.del(`artifact:${id}`);

      recordAuditEvent({ action: 'artifact.delete', target: id });
      return successResponse({ success: true, message: 'Artifact deleted successfully' });
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
