import { createHash, createHmac } from "node:crypto";
import { timingSafeStringEqual } from "./api-key-auth";

const SIGNATURE_PATTERN = /^t=(\d+),v1=([a-f0-9]{64})$/;

export function createWebhookSignature(
  payload: string,
  secret: string,
  timestamp: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export async function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: string = String(Math.floor(Date.now() / 1000)),
): Promise<string> {
  return createWebhookSignature(payload, secret, timestamp);
}

export function verifyWebhookSignatureSync(
  payload: string,
  signature: string,
  secrets: string | readonly string[],
  toleranceSeconds = 300,
  timestampHeader?: string,
): boolean {
  const match = SIGNATURE_PATTERN.exec(signature);
  if (!match) return false;

  const timestamp = match[1];
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds)
    return false;
  if (
    timestampHeader !== undefined &&
    !timingSafeStringEqual(timestamp, timestampHeader)
  )
    return false;

  const signatureHex = match[2];
  const candidates = typeof secrets === "string" ? [secrets] : secrets;
  let verified = false;
  for (const secret of candidates) {
    const expected = createWebhookSignature(payload, secret, timestamp).slice(
      "t=".length + timestamp.length + ",v1=".length,
    );
    verified = timingSafeStringEqual(signatureHex, expected) || verified;
  }
  return verified;
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secrets: string | readonly string[],
  toleranceSeconds = 300,
  timestampHeader?: string,
): Promise<boolean> {
  return verifyWebhookSignatureSync(
    payload,
    signature,
    secrets,
    toleranceSeconds,
    timestampHeader,
  );
}

export function getWebhookSigningSecrets(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = env.CRASHLAB_WEBHOOK_SIGNING_SECRETS?.split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const legacySecret = env.CRASHLAB_WEBHOOK_SIGNING_SECRET?.trim();
  return legacySecret ? [legacySecret] : [];
}

export function getWebhookSigningKeyId(secret: string): string {
  return `key-${createHash("sha256").update(secret).digest("hex").slice(0, 16)}`;
}
