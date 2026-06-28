/**
 * Slack webhook integration for sending notifications
 */

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
 * Sends a message to Slack webhook
 */
export async function sendSlackNotification(
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
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
