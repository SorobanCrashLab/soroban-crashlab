/**
 * POST /api/integrations/discord
 *
 * Sends a notification to Discord via webhook.
 * Accepts a notification payload and forwards it to the configured Discord webhook.
 */

import { withRouteErrorHandling, readJsonBody, jsonError } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { createDiscordAdapter, type DiscordMessage } from '@/lib/integrations/discord-webhook';

export const POST = withRouteErrorHandling(
  'POST /api/integrations/discord',
  async (request: Request) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return jsonError('Discord webhook URL not configured', 503);
    }

    const bodyResult = await readJsonBody(request);
    if ('error' in bodyResult) {
      return bodyResult.error;
    }

    const message = bodyResult.body as DiscordMessage;

    if (!message.content && (!message.embeds || message.embeds.length === 0)) {
      return jsonError('Message must include either content or embeds', 400);
    }

    const adapter = createDiscordAdapter();
    const result = await adapter.sendNotification({ webhookUrl }, message);

    if (!result.success) {
      return jsonError(result.error || 'Failed to send Discord notification', 500);
    }

    return successResponse({ success: true, message: 'Notification sent successfully' });
  },
  'Failed to send Discord notification',
);
