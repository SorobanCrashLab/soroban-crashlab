import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import {
  verifySmtpConnection,
  validateSmtpConfig,
  type SmtpConfig,
} from '@/lib/integrations/smtp-email';

/**
 * POST /api/integrations/smtp/test-connection
 * Verifies that the supplied SMTP configuration can authenticate with the
 * mail server, without sending an email. Body: SmtpConfig JSON.
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

  const result = await verifySmtpConnection(candidate);
  if (result.success) {
    return successResponse(result);
  }
  return errorResponse(result.error || 'SMTP connection test failed.', 422);
}
