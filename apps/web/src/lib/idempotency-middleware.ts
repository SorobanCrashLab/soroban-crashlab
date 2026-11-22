/**
 * Idempotency middleware for mutating API routes (#1634).
 *
 * Parses the optional `Idempotency-Key` header and resolves the record store
 * that will hold the first request's result. The route handler owns the
 * replay/conflict semantics: it receives the parsed key and store so it can
 * look up, fingerprint and store responses around its own work.
 */

import type { NextRequest } from 'next/server';

import { codedErrorResponse } from './error-codes';
import {
  IDEMPOTENCY_KEY_HEADER,
  parseIdempotencyKey,
} from './idempotency-key';
import {
  selectIdempotencyStore,
  type IdempotencyStore,
} from './storage/idempotency-store';

export interface IdempotencyContext {
  /** Parsed key, or null when the request opted out of idempotency. */
  key: string | null;
  /** Store to persist results in, or null when no key was supplied. */
  store: IdempotencyStore | null;
}

/**
 * Runs `handler` with the request's idempotency context. A malformed key is
 * rejected before the handler runs, matching the documented contract.
 */
export async function withIdempotency(
  request: NextRequest,
  _scope: string,
  handler: (ctx: IdempotencyContext) => Promise<Response>,
): Promise<Response> {
  const parsed = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER));
  if (!parsed.ok) {
    return codedErrorResponse('IDEMPOTENCY_KEY_INVALID', parsed.error);
  }

  return handler({
    key: parsed.key,
    store: parsed.key === null ? null : selectIdempotencyStore(),
  });
}
