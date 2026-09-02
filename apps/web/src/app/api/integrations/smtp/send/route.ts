import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { sendEmail, validateEmail } from '@/lib/integrations/smtp-email';
import { getStoredSmtpConfig, recordEmailLogEntry } from '@/lib/integrations/smtp-store';

const TEST_SUBJECT = '[Test] SorobanCrashLab SMTP Integration';

/**
 * POST /api/integrations/smtp/send
 * Sends a test email to the given recipient using the saved SMTP
 * configuration. Body: { to: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  const to =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).to
      : undefined;

  if (typeof to !== 'string' || !validateEmail(to)) {
    return errorResponse(
      'Field "to" must be a valid email address.',
      400,
    );
  }

  const config = getStoredSmtpConfig();
  if (!config) {
    return errorResponse(
      'No SMTP configuration saved yet. Save your configuration before sending a test email.',
      404,
    );
  }

  const result = await sendEmail(config, {
    to,
    subject: TEST_SUBJECT,
    text: 'This is a test email confirming your SMTP integration is configured correctly.',
    html: '<p>This is a test email confirming your SMTP integration is configured correctly.</p>',
  });

  recordEmailLogEntry({
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to,
    subject: TEST_SUBJECT,
    status: result.success ? 'sent' : 'failed',
    sentAt: new Date().toISOString(),
    messageId: result.messageId,
    error: result.error,
  });

  if (result.success) {
    return successResponse(result);
  }
  return errorResponse(result.error || 'Failed to send test email.', 422);
}
