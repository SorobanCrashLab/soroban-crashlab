/**
 * POST /api/integrations/slack
 *
 * Sends a threaded Slack notification with a run detail preview. The first
 * event for a given run posts a new top-level message; subsequent events for
 * the same run reply inside that message's thread using `thread_ts`, so a
 * run's full lifecycle (started -> completed/failed) reads as one thread
 * instead of scattering unrelated messages across the channel.
 */

import { withRouteErrorHandling, readJsonBody, jsonError } from "@/lib/route-handler";
import { successResponse } from "@/lib/api-response-utils";
import {
  buildRunDetailPreviewBlocks,
  createSlackAdapter,
  type RunDetailPreviewInput,
} from "@/lib/integrations/slack-webhook";
import { getSlackThreadStore } from "@/lib/integrations/slack-thread-store";

interface SlackNotifyRequestBody {
  run: RunDetailPreviewInput;
}

function isValidRunDetailPreviewInput(value: unknown): value is RunDetailPreviewInput {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunDetailPreviewInput>;
  return (
    typeof run.runId === "string" &&
    run.runId.length > 0 &&
    typeof run.eventType === "string" &&
    ["started", "completed", "failed", "cancelled"].includes(run.eventType) &&
    typeof run.area === "string" &&
    typeof run.severity === "string" &&
    typeof run.status === "string" &&
    typeof run.durationMs === "number"
  );
}

export const POST = withRouteErrorHandling(
  "POST /api/integrations/slack",
  async (request: Request) => {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ID;

    if (!botToken || !channel) {
      return jsonError("Slack bot token or channel is not configured", 503);
    }

    const bodyResult = await readJsonBody(request);
    if ("error" in bodyResult) {
      return bodyResult.error;
    }

    const { run } = bodyResult.body as Partial<SlackNotifyRequestBody>;

    if (!isValidRunDetailPreviewInput(run)) {
      return jsonError(
        "Request body must include a `run` object with runId, eventType, area, severity, status, and durationMs",
        400,
      );
    }

    const { blocks, fallbackText } = buildRunDetailPreviewBlocks(run);
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

    // Only the first message for a run becomes the thread root; later
    // events keep replying into it via the stored ts.
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
  },
  "Failed to send Slack notification",
);
