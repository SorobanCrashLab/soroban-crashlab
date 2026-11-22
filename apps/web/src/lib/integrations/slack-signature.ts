/**
 * Slack request-signature verification (#1428).
 *
 * Slack signs every interactivity request with an HMAC-SHA256 over
 * `v0:{timestamp}:{raw body}` using the app's signing secret. The generic
 * webhook-HMAC work had not landed when this shipped, so this module owns the
 * Slack-specific wrapper end to end; if a shared primitive arrives later the
 * digest call below is the only line that needs to move.
 *
 * The signing secret is read from the environment by the caller and is never
 * logged or embedded in a payload.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SLACK_SIGNATURE_VERSION = 'v0';

/** Slack's documented anti-replay window: reject anything older than 5 minutes. */
export const SLACK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type SlackVerificationFailure =
  | 'not-configured'
  | 'missing-signature'
  | 'missing-timestamp'
  | 'stale-timestamp'
  | 'bad-signature';

export interface SlackVerificationResult {
  ok: boolean;
  reason?: SlackVerificationFailure;
}

export interface SlackVerificationInput {
  secret: string | undefined;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  body: string;
  /** Seconds since epoch; injectable so freshness is testable. */
  nowSeconds: number;
}

export function buildSlackBaseString(timestamp: string, body: string): string {
  return `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`;
}

export function signSlackRequest(secret: string, timestamp: string, body: string): string {
  const digest = createHmac('sha256', secret)
    .update(buildSlackBaseString(timestamp, body))
    .digest('hex');
  return `${SLACK_SIGNATURE_VERSION}=${digest}`;
}

/** Constant-time compare that tolerates unequal lengths without leaking them. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifySlackRequest(input: SlackVerificationInput): SlackVerificationResult {
  if (!input.secret) return { ok: false, reason: 'not-configured' };
  if (!input.signature) return { ok: false, reason: 'missing-signature' };
  if (!input.timestamp) return { ok: false, reason: 'missing-timestamp' };

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'missing-timestamp' };
  }

  // Absolute drift, so a replay from the future is rejected too.
  if (Math.abs(input.nowSeconds - timestampSeconds) > SLACK_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale-timestamp' };
  }

  const expected = signSlackRequest(input.secret, input.timestamp, input.body);
  return safeEqual(expected, input.signature)
    ? { ok: true }
    : { ok: false, reason: 'bad-signature' };
}
