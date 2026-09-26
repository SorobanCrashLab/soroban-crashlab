import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { getApiTokenSecretHash, revokeApiToken } from '../../../../../../lib/storage/api-token-store';
import { unregisterTokenPrincipal } from '../../../../../../lib/storage/token-principal-store';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return errorResponse('Token ID required.', 400);
  }

  // Capture the digest before revocation so the principal index can drop it.
  const sha256Hash = getApiTokenSecretHash(id);

  const success = revokeApiToken(id);
  if (!success) {
    return errorResponse('Token not found.', 404);
  }

  // A revoked token must stop resolving to a role immediately, not after its
  // grace window or its next expiry sweep.
  if (sha256Hash) {
    await unregisterTokenPrincipal({ sha256Hash });
  }

  return successResponse({ message: 'Token revoked successfully.' });
}
