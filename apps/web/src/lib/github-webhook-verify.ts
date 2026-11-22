import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface GitHubWebhookHeaders {
  'x-hub-signature-256'?: string;
  'x-github-signature'?: string;
  'x-hub-timestamp'?: string;
  'x-github-timestamp'?: string;
  'x-github-event'?: string;
  'x-github-delivery'?: string;
}

export function fixedTimeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf-8');
  const bufferB = Buffer.from(b, 'utf-8');

  const maxLength = Math.max(bufferA.length, bufferB.length);
  const paddedA = Buffer.alloc(maxLength, 0);
  const paddedB = Buffer.alloc(maxLength, 0);

  bufferA.copy(paddedA);
  bufferB.copy(paddedB);

  return timingSafeEqual(paddedA, paddedB) && bufferA.length === bufferB.length;
}

export function verifyGitHubWebhookTimestamp(
  timestamp: string | undefined,
  now: number = Date.now(),
  toleranceMs: number = TIMESTAMP_TOLERANCE_MS,
): boolean {
  if (!timestamp || timestamp.trim().length === 0) {
    return false;
  }

  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  const timestampMs = Math.abs(parsed) > 1e12 ? parsed : parsed * 1000;
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const diffMs = Math.abs(now - timestampMs);
  return diffMs <= toleranceMs;
}

export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const match = SIGNATURE_PATTERN.exec(signature);
  if (!match) {
    return false;
  }

  const providedSignature = match[1];
  const computedHmac = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return fixedTimeStringEqual(providedSignature, computedHmac);
}

export function getGitHubWebhookSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
}
