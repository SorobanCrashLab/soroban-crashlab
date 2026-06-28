/**
 * SMTP email integration for sending critical event notifications
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface EmailNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Validates SMTP configuration
 */
export function validateSmtpConfig(config: SmtpConfig): string | null {
  if (!config.host || !config.host.trim()) {
    return "SMTP host is required";
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    return "SMTP port must be between 1 and 65535";
  }

  if (!config.auth.user || !config.auth.user.trim()) {
    return "SMTP user is required";
  }

  if (!config.auth.pass || !config.auth.pass.trim()) {
    return "SMTP password is required";
  }

  if (!config.from || !config.from.trim()) {
    return "From address is required";
  }

  if (!validateEmail(config.from)) {
    return "Invalid from email address";
  }

  return null;
}

/**
 * Validates email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates email message
 */
export function validateEmailMessage(message: EmailMessage): string | null {
  if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
    return "Recipient email address is required";
  }

  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  for (const email of recipients) {
    if (!validateEmail(email)) {
      return `Invalid recipient email address: ${email}`;
    }
  }

  if (!message.subject || !message.subject.trim()) {
    return "Email subject is required";
  }

  if (!message.text && !message.html) {
    return "Email must have either text or HTML content";
  }

  return null;
}

/**
 * Sends email via SMTP
 * Note: This is a simplified implementation. In production, use nodemailer or similar library.
 */
export async function sendEmail(
  config: SmtpConfig,
  message: EmailMessage,
): Promise<EmailNotificationResult> {
  const configError = validateSmtpConfig(config);
  if (configError) {
    return { success: false, error: configError };
  }

  const messageError = validateEmailMessage(message);
  if (messageError) {
    return { success: false, error: messageError };
  }

  // Note: This is a placeholder implementation
  // In production, integrate with nodemailer or similar SMTP library
  try {
    // Simulate SMTP connection and sending
    // Real implementation would use nodemailer.createTransport() and transporter.sendMail()
    const mockMessageId = `<${Date.now()}.${Math.random()}@crashlab.local>`;

    // Validate connection parameters
    if (config.port === 0 || !config.host) {
      throw new Error("Invalid SMTP configuration");
    }

    return {
      success: true,
      messageId: mockMessageId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Creates email message for critical event
 */
export function createCriticalEventEmail(
  eventType: "run_failed" | "system_error" | "security_alert",
  title: string,
  description: string,
  metadata?: Record<string, string>,
): Pick<EmailMessage, "subject" | "text" | "html"> {
  const subject = `[CRITICAL] CrashLab: ${title}`;

  let metadataText = "";
  let metadataHtml = "";

  if (metadata) {
    metadataText =
      "\n\nDetails:\n" +
      Object.entries(metadata)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");

    metadataHtml =
      "<h3>Details:</h3><ul>" +
      Object.entries(metadata)
        .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
        .join("") +
      "</ul>";
  }

  const text = `CRITICAL ALERT: ${title}\n\nType: ${eventType}\n\n${description}${metadataText}\n\n---\nThis is an automated message from CrashLab.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #ff0000; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
        <h1 style="margin: 0;">🚨 CRITICAL ALERT</h1>
      </div>
      <div style="background-color: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
        <h2>${title}</h2>
        <p><strong>Type:</strong> ${eventType}</p>
        <p>${description}</p>
        ${metadataHtml}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from CrashLab.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Creates email message for run event
 */
export function createRunEventEmail(
  eventType: "started" | "completed" | "failed" | "cancelled",
  runId: string,
  details?: Record<string, string>,
): Pick<EmailMessage, "subject" | "text" | "html"> {
  const emojis: Record<string, string> = {
    started: "🚀",
    completed: "✅",
    failed: "❌",
    cancelled: "⚠️",
  };

  const subject = `${emojis[eventType]} CrashLab Run ${eventType}: ${runId}`;

  let detailsText = "";
  let detailsHtml = "";

  if (details) {
    detailsText =
      "\n\nDetails:\n" +
      Object.entries(details)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");

    detailsHtml =
      "<h3>Details:</h3><ul>" +
      Object.entries(details)
        .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
        .join("") +
      "</ul>";
  }

  const text = `Run ${eventType.toUpperCase()}\n\nRun ID: ${runId}${detailsText}\n\n---\nThis is an automated message from CrashLab.`;

  const colors: Record<string, string> = {
    started: "#36a64f",
    completed: "#2eb886",
    failed: "#ff0000",
    cancelled: "#ffa500",
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${colors[eventType]}; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
        <h1 style="margin: 0;">${emojis[eventType]} Run ${eventType.toUpperCase()}</h1>
      </div>
      <div style="background-color: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
        <p><strong>Run ID:</strong> ${runId}</p>
        ${detailsHtml}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from CrashLab.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Batch send emails to multiple recipients
 */
export async function sendBatchEmails(
  config: SmtpConfig,
  messages: EmailMessage[],
): Promise<EmailNotificationResult[]> {
  const results: EmailNotificationResult[] = [];

  for (const message of messages) {
    const result = await sendEmail(config, message);
    results.push(result);
  }

  return results;
}
