import { createHmac } from 'node:crypto';
import { timingSafeStringEqual } from './api-key-auth';

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/;

export interface GitHubWebhookHeaders {
  'x-hub-signature-256'?: string;
  'x-github-event'?: string;
  'x-github-delivery'?: string;
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

  return timingSafeStringEqual(providedSignature, computedHmac);
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
