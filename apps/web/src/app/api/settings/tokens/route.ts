import { NextRequest } from 'next/server';
import {
  createApiToken,
  listApiTokens,
  ApiTokenScope,
} from '../../../../lib/storage/api-token-store';
import { checkRequestSize } from '../../../../lib/request-size-limits';
import { errorResponse, createdResponse, successResponse } from '../../../../lib/api-response-utils';

export async function GET() {
  const tokens = listApiTokens();
  return successResponse({ tokens });
}

export async function POST(request: NextRequest) {
  const sizeError = checkRequestSize(request);
  if (sizeError) {
    return sizeError;
  }

  try {
    const body = await request.json();
    const { name, scopes, expiresAt } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('Token name is required.', 400);
    }

    const validScopeValues: ApiTokenScope[] = [
      'webhook:read',
      'webhook:write',
      'runs:read',
      'runs:write',
      'settings:read',
      'settings:write',
      '*',
    ];

    let tokenScopes: ApiTokenScope[] = ['runs:read'];
    if (Array.isArray(scopes) && scopes.length > 0) {
      tokenScopes = scopes.filter((s) => validScopeValues.includes(s));
      if (tokenScopes.length === 0) {
        tokenScopes = ['runs:read'];
      }
    }

    let validatedExpiry: string | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (isNaN(parsed.getTime())) {
        return errorResponse('Invalid expiry date format.', 400);
      }
      validatedExpiry = parsed.toISOString();
    }

    const { secret, token } = createApiToken({
      name: name.trim(),
      scopes: tokenScopes,
      expiresAt: validatedExpiry,
    });

    return createdResponse({
      message: 'Token created successfully. Store this secret safely as it will not be shown again.',
      secret,
      token,
    });
  } catch {
    return errorResponse('Failed to process token creation request.', 400);
  }
}
