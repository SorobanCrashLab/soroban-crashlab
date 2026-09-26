/**
 * SMTP email integration for sending critical event notifications.
 *
 * Server-only: imports nodemailer. Client components must import types and
 * validation helpers from ./smtp-validation instead (see that file's header
 * comment for why).
 */

import * as nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} from "../timeouts";
import {
  validateSmtpConfig,
  validateEmailMessage,
  type SmtpConfig,
  type EmailMessage,
  type EmailNotificationResult,
} from "./smtp-validation";

export * from "./smtp-validation";

export interface SmtpTimeouts {
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/**
 * nodemailer's defaults (2 min connect, 30 s greeting, 10 min socket) let a
 * silent SMTP server hold a serverless function far past its limit (#1633).
 */
export const SMTP_TIMEOUTS: SmtpTimeouts = Object.freeze({
  connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
  greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
  socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
});

export function buildSmtpTransportOptions(
  config: SmtpConfig,
  timeouts: SmtpTimeouts = SMTP_TIMEOUTS,
): SMTPTransport.Options {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    ...timeouts,
  };
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport(buildSmtpTransportOptions(config));
}

/**
 * Sends email via SMTP using nodemailer.
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

  try {
    const transporter = createTransporter(config);
    const info = await transporter.sendMail({
      from: config.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Verifies that the SMTP server is reachable and the supplied credentials
 * are accepted, without sending an email.
 */
export async function verifySmtpConnection(
  config: SmtpConfig,
): Promise<EmailNotificationResult> {
  const configError = validateSmtpConfig(config);
  if (configError) {
    return { success: false, error: configError };
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `SMTP connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export interface SmtpAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function sendEmailImpl(
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

  try {
    const mockMessageId = `<${Date.now()}.${Math.random()}@crashlab.local>`;

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

export function createSmtpAdapter(_options: SmtpAdapterOptions = {}) {
  return {
    sendEmail: sendEmailImpl,

    async sendBatchEmails(
      config: SmtpConfig,
      messages: EmailMessage[],
    ): Promise<EmailNotificationResult[]> {
      const results: EmailNotificationResult[] = [];

      for (const message of messages) {
        const result = await sendEmailImpl(config, message);
        results.push(result);
      }

      return results;
    },
  };
}
