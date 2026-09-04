export async function signWebhookPayload(payload: string, secret: string, timestamp: string): Promise<string> {
  const data = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `t=${timestamp},v1=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyWebhookSignature(payload: string, signature: string, secret: string, toleranceSeconds = 300): Promise<boolean> {
  const match = signature.match(/t=(\d+),v1=([a-f0-9]+)/);
  if (!match) return false;
  const timestamp = match[1];
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;
  const expected = await signWebhookPayload(payload, secret, timestamp);
  return expected === signature;
}
