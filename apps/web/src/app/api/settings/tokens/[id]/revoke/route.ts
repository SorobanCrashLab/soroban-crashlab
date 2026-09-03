import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { revokeApiToken } from '../../../../../../lib/storage/api-token-store';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return errorResponse('Token ID required.', 400);
  }

  const success = revokeApiToken(id);
  if (!success) {
    return errorResponse('Token not found.', 404);
  }

  return successResponse({ message: 'Token revoked successfully.' });
}
