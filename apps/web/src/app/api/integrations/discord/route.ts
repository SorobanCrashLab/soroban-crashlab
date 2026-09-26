/**
 * POST /api/integrations/discord
 *
 * Sends a notification to Discord via webhook.
 * Accepts a notification payload and forwards it to the configured Discord webhook.
 */

import { createRouteHandler, jsonError } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { createDiscordAdapter, type DiscordMessage } from '@/lib/integrations/discord-webhook';
import { z } from 'zod';

const discordMessageSchema = z.object({
  content: z.string().optional(),
  embeds: z.array(z.any()).optional(),
}).refine(data => data.content || (data.embeds && data.embeds.length > 0), {
  message: 'Message must include either content or embeds'
});

export const POST = createRouteHandler(
  {
    label: 'POST /api/integrations/discord',
    fallbackMessage: 'Failed to send Discord notification',
    bodySchema: discordMessageSchema,
  },
  async (request, { body }) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return jsonError('Discord webhook URL not configured', 503);
    }

    const message = body as DiscordMessage;
    const adapter = createDiscordAdapter();
    const result = await adapter.sendNotification({ webhookUrl }, message);

    if (!result.success) {
      return jsonError(result.error || 'Failed to send Discord notification', 500);
    }

    return successResponse({ success: true, message: 'Notification sent successfully' });
  }
);
