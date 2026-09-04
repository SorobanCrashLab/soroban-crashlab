import { successResponse } from '@/lib/api-response-utils';
import { getEmailLog } from '@/lib/integrations/smtp-store';

/**
 * GET /api/integrations/smtp/history
 * Returns the recent SMTP send history for this server process.
 */
export async function GET() {
  return successResponse({ history: getEmailLog() });
}
