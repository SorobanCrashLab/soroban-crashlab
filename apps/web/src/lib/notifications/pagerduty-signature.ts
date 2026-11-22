/**
 * PagerDuty v3 webhook signature check (#1892). The header carries one or more
 * `v1=<hex HMAC-SHA256(body)>` values; any match is accepted so a secret can
 * be rotated without dropping events.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPagerDutySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'));
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1='))
    .some((part) => {
      const candidate = Buffer.from(part.slice(3));
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}
