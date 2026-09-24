import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { rotateApiToken } from '../../../../../../lib/storage/api-token-store';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return errorResponse('Token ID required.', 400);
  }

  const result = rotateApiToken(id);
  if (!result) {
    return errorResponse('Token not found.', 404);
  }

  return successResponse({
    message:
      'Token rotated successfully. The previous token remains valid for the grace window, then is revoked. Store the new secret safely as it will not be shown again.',
    secret: result.secret,
    token: result.token,
    previousTokenId: result.previousTokenId,
  });
}