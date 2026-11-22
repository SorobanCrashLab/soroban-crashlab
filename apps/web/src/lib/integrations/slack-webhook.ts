/**
 * Slack webhook integration for sending notifications
 */

import { createAbortSignal } from './adapter-utils';

export interface SlackWebhookConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface SlackMessage {
  text: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
}

export interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: SlackField[];
  footer?: string;
  ts?: number;
}

export interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

export interface SlackNotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Validates Slack webhook URL format
 */
export function validateSlackWebhookUrl(url: string): string | null {
  if (!url || !url.trim()) {
    return "Slack webhook URL is required";
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("slack.com")) {
      return "Invalid Slack webhook URL domain";
    }
    if (!parsed.pathname.includes("/services/")) {
      return "Invalid Slack webhook URL path";
    }
  } catch {
    return "Invalid Slack webhook URL format";
  }

  return null;
}

/**
 * Creates a formatted message for run events
 */
export function createRunEventMessage(
  eventType: "started" | "completed" | "failed" | "cancelled",
  runId: string,
  details?: Record<string, string>,
): SlackMessage {
  const colors: Record<string, string> = {
    started: "#36a64f",
    completed: "#2eb886",
    failed: "#ff0000",
    cancelled: "#ffa500",
  };

  const emojis: Record<string, string> = {
    started: ":rocket:",
    completed: ":white_check_mark:",
    failed: ":x:",
    cancelled: ":warning:",
  };

  const fields: SlackField[] = [
    { title: "Run ID", value: runId, short: true },
    { title: "Event", value: eventType, short: true },
  ];

  if (details) {
    Object.entries(details).forEach(([key, value]) => {
      fields.push({ title: key, value, short: true });
    });
  }

  return {
    text: `${emojis[eventType]} Run ${eventType}: ${runId}`,
    attachments: [
      {
        color: colors[eventType],
        title: `Run ${eventType.toUpperCase()}`,
        fields,
        footer: "CrashLab",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Creates a formatted message for critical alerts
 */
export function createCriticalAlertMessage(
  title: string,
  message: string,
  metadata?: Record<string, string>,
): SlackMessage {
  const fields: SlackField[] = [];

  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      fields.push({ title: key, value, short: true });
    });
  }

  return {
    text: `:rotating_light: CRITICAL ALERT: ${title}`,
    attachments: [
      {
        color: "#ff0000",
        title: title,
        text: message,
        fields,
        footer: "CrashLab",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Creates a simple text message
 */
export function createSimpleMessage(text: string): SlackMessage {
  return { text };
}

// ─── Threaded notifications via the Slack Web API ─────────────────────────
//
// Incoming webhooks (above) always post a new top-level message and never
// return the posted message's `ts`, so there is nothing to thread later
// events against. Real Slack threading requires `chat.postMessage` from the
// Web API (a bot token with the `chat:write` scope), which returns the `ts`
// needed to reply into the same thread with `thread_ts`.

const SLACK_API_BASE = "https://slack.com/api";

export interface SlackBotConfig {
  botToken: string;
  channel: string;
}

export interface SlackApiMessageResult {
  success: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * Validates a Slack bot token has the expected `xoxb-` shape. Slack does not
 * expose a lightweight way to verify scopes without calling the API, so this
 * only catches obviously-wrong values before making a network call.
 */
export function validateSlackBotToken(token: string): string | null {
  if (!token || !token.trim()) {
    return "Slack bot token is required";
  }
  if (!token.startsWith("xoxb-")) {
    return "Slack bot token must be a bot token (starts with xoxb-)";
  }
  return null;
}

export interface RunDetailPreviewInput {
  runId: string;
  eventType: "started" | "completed" | "failed" | "cancelled";
  area: string;
  severity: string;
  status: string;
  durationMs: number;
  crashSignature?: string;
  dashboardUrl?: string;
}

const EVENT_HEADLINE: Record<RunDetailPreviewInput["eventType"], string> = {
  started: ":rocket: Run started",
  completed: ":white_check_mark: Run completed",
  failed: ":x: Run failed",
  cancelled: ":warning: Run cancelled",
};

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Builds a Block Kit "run detail preview" for a fuzzing run event: status,
 * area, severity, duration, and (for failures) the crash signature, with an
 * optional deep link back to the run in the dashboard.
 */
export function buildRunDetailPreviewBlocks(run: RunDetailPreviewInput): {
  blocks: SlackBlock[];
  fallbackText: string;
} {
  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*Run:*\n${run.runId}` },
    { type: "mrkdwn", text: `*Status:*\n${run.status}` },
    { type: "mrkdwn", text: `*Area:*\n${run.area}` },
    { type: "mrkdwn", text: `*Severity:*\n${run.severity}` },
    { type: "mrkdwn", text: `*Duration:*\n${formatDurationMs(run.durationMs)}` },
  ];

  if (run.crashSignature) {
    fields.push({ type: "mrkdwn", text: `*Signature:*\n${run.crashSignature}` });
  }

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${EVENT_HEADLINE[run.eventType]}*` },
    },
    {
      type: "section",
      fields,
    },
  ];

  if (run.dashboardUrl) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `<${run.dashboardUrl}|View run in dashboard>` },
    });
  }

  const fallbackText = `${EVENT_HEADLINE[run.eventType]}: ${run.runId} (${run.status})`;

  return { blocks, fallbackText };
}

export interface SlackAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createSlackAdapter(options: SlackAdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    async sendNotification(
      config: SlackWebhookConfig,
      message: SlackMessage,
    ): Promise<SlackNotificationResult> {
      const validationError = validateSlackWebhookUrl(config.webhookUrl);
      if (validationError) {
        return { success: false, error: validationError };
      }

      const payload: SlackMessage = {
        ...message,
        channel: message.channel || config.channel,
        username: message.username || config.username || "CrashLab",
        icon_emoji: message.icon_emoji || config.iconEmoji || ":robot_face:",
      };

      try {
        const response = await fetchImpl(config.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `Slack API error: ${response.status} - ${errorText}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Failed to send Slack notification: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },

    async postMessage(
      config: SlackBotConfig,
      blocks: SlackBlock[],
      fallbackText: string,
      threadTs?: string,
    ): Promise<SlackApiMessageResult> {
      const validationError = validateSlackBotToken(config.botToken);
      if (validationError) {
        return { success: false, error: validationError };
      }

      try {
        const response = await fetchImpl(`${SLACK_API_BASE}/chat.postMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${config.botToken}`,
          },
          signal,
          body: JSON.stringify({
            channel: config.channel,
            text: fallbackText,
            blocks,
            ...(threadTs ? { thread_ts: threadTs } : {}),
          }),
        });

        const data = (await response.json()) as {
          ok: boolean;
          ts?: string;
          channel?: string;
          error?: string;
        };

        if (!response.ok || !data.ok) {
          return { success: false, error: data.error || `Slack API error: ${response.status}` };
        }

        return { success: true, ts: data.ts, channel: data.channel };
      } catch (error) {
        return {
          success: false,
          error: `Failed to post Slack message: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  };
}
