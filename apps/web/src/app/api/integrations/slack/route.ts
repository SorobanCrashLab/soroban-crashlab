/**
 * POST /api/integrations/slack
 *
 * Sends a threaded Slack notification with a run detail preview. The first
 * event for a given run posts a new top-level message; subsequent events for
 * the same run reply inside that message's thread using `thread_ts`, so a
 * run's full lifecycle (started -> completed/failed) reads as one thread
 * instead of scattering unrelated messages across the channel.
 */

import { createRouteHandler, jsonError } from "@/lib/route-handler";
import { successResponse } from "@/lib/api-response-utils";
import {
  buildRunDetailPreviewBlocks,
  createSlackAdapter,
  type RunDetailPreviewInput,
} from "@/lib/integrations/slack-webhook";
import { getSlackThreadStore } from "@/lib/integrations/slack-thread-store";
import { z } from "zod";

const slackNotifySchema = z.object({
  run: z.object({
    runId: z.string().min(1),
    eventType: z.enum(["started", "completed", "failed", "cancelled"]),
    area: z.string(),
    severity: z.string(),
    status: z.string(),
    durationMs: z.number(),
  }),
});

export const POST = createRouteHandler(
  {
    label: "POST /api/integrations/slack",
    fallbackMessage: "Failed to send Slack notification",
    bodySchema: slackNotifySchema,
  },
  async (request, { body }) => {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ID;

    if (!botToken || !channel) {
      return jsonError("Slack bot token or channel is not configured", 503);
    }

    const { run } = body;

    const { blocks, fallbackText } = buildRunDetailPreviewBlocks(run as RunDetailPreviewInput);
    const store = getSlackThreadStore();
    const existingThread = store.getThread(run.runId);

    const adapter = createSlackAdapter();
    const result = await adapter.postMessage(
      { botToken, channel },
      blocks,
      fallbackText,
      existingThread?.threadTs,
    );

    if (!result.success) {
      return jsonError(result.error || "Failed to send Slack notification", 500);
    }

    if (!existingThread && result.ts && result.channel) {
      store.setThread({
        runId: run.runId,
        channel: result.channel,
        threadTs: result.ts,
        updatedAt: new Date().toISOString(),
      });
    }

    return successResponse({
      success: true,
      message: "Notification sent successfully",
      threaded: Boolean(existingThread),
    });
  }
);
