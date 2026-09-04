import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { validateSmtpConfig, type SmtpConfig } from '@/lib/integrations/smtp-email';
import { getStoredSmtpConfig, setStoredSmtpConfig } from '@/lib/integrations/smtp-store';

/**
 * GET /api/integrations/smtp/config
 * Returns the saved SMTP configuration, or 404 if none has been saved yet.
 */
export async function GET() {
  const config = getStoredSmtpConfig();
  if (!config) {
    return errorResponse('No SMTP configuration saved yet.', 404);
  }
  return successResponse(config);
}

/**
 * POST /api/integrations/smtp/config
 * Validates and persists an SMTP configuration. Body: SmtpConfig JSON.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  if (typeof body !== 'object' || body === null) {
    return errorResponse('Request body must be a JSON object.', 400);
  }

  const candidate = body as SmtpConfig;
  const validationError = validateSmtpConfig(candidate);
  if (validationError) {
    return errorResponse(validationError, 422);
  }

  setStoredSmtpConfig(candidate);
  return successResponse(candidate);
}
