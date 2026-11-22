/**
 * Discord webhook integration for sending notifications
 */

import { createAbortSignal } from './adapter-utils';

export interface DiscordWebhookConfig {
  webhookUrl: string;
  username?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordMessage {
  content?: string;
  username?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordNotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Validates Discord webhook URL format
 */
export function validateDiscordWebhookUrl(url: string): string | null {
  if (!url || !url.trim()) {
    return "Discord webhook URL is required";
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("discord.com") && !parsed.hostname.includes("discordapp.com")) {
      return "Invalid Discord webhook URL domain";
    }
    if (!parsed.pathname.includes("/api/webhooks/")) {
      return "Invalid Discord webhook URL path";
    }
  } catch {
    return "Invalid Discord webhook URL format";
  }

  return null;
}

/**
 * Creates a formatted embed for run events
 */
export function createRunEventEmbed(
  eventType: "started" | "completed" | "failed" | "cancelled",
  runId: string,
  details?: Record<string, string>,
): DiscordEmbed {
  const colors: Record<string, number> = {
    started: 0x36a64f, // green
    completed: 0x2eb886, // teal
    failed: 0xff0000, // red
    cancelled: 0xffa500, // orange
  };

  const emojis: Record<string, string> = {
    started: "🚀",
    completed: "✅",
    failed: "❌",
    cancelled: "⚠️",
  };

  const fields: DiscordField[] = [
    { name: "Run ID", value: runId, inline: true },
    { name: "Event", value: eventType, inline: true },
  ];

  if (details) {
    Object.entries(details).forEach(([key, value]) => {
      fields.push({ name: key, value, inline: true });
    });
  }

  return {
    title: `${emojis[eventType]} Run ${eventType.toUpperCase()}`,
    description: `Run ${eventType}: ${runId}`,
    color: colors[eventType],
    fields,
    footer: { text: "CrashLab" },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a formatted embed for critical alerts
 */
export function createCriticalAlertEmbed(
  title: string,
  message: string,
  metadata?: Record<string, string>,
): DiscordEmbed {
  const fields: DiscordField[] = [];

  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      fields.push({ name: key, value, inline: true });
    });
  }

  return {
    title: `🚨 CRITICAL ALERT: ${title}`,
    description: message,
    color: 0xff0000, // red
    fields,
    footer: { text: "CrashLab" },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a simple text message
 */
export function createSimpleMessage(text: string): DiscordMessage {
  return { content: text };
}

export interface DiscordAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createDiscordAdapter(options: DiscordAdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    async sendNotification(
      config: DiscordWebhookConfig,
      message: DiscordMessage,
    ): Promise<DiscordNotificationResult> {
      const validationError = validateDiscordWebhookUrl(config.webhookUrl);
      if (validationError) {
        return { success: false, error: validationError };
      }

      const payload: DiscordMessage = {
        ...message,
        username: message.username || config.username || "CrashLab",
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
            error: `Discord API error: ${response.status} - ${errorText}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Failed to send Discord notification: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  };
}
