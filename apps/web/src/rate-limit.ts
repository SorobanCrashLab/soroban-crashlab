/**
 * API proxy rate limiter — tiered rate limiting via TieredLimiter.
 *
 * This module now delegates to the TieredLimiter in `lib/security/api-gateway/TieredLimiter.ts`
 * which provides per-IP, per-user, per-API-key, and per-tenant rate limiting
 * with burst + sustained quotas backed by Redis.
 *
 * The legacy IP-layer and principal-layer limiting code has been replaced.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTieredLimiter } from './lib/security/api-gateway/TieredLimiter';

// ─── correlation ID ───────────────────────────────────────────────────────────

/**
 * Generates a correlation ID for request tracing.
 *
 * Format: `<timestamp>-<random>-<random>` — sortable by issuance time and
 * unique enough to correlate a request across logs and responses.
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${Math.random().toString(36).substring(2, 11)}`;
}

// ─── proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  // Use the new TieredLimiter for comprehensive rate limiting
  const tieredLimiter = getTieredLimiter();
  
  const decision = await tieredLimiter.check(request);

  // Build response with rate limit headers
  const response = decision.allowed 
    ? NextResponse.next() 
    : tieredLimiter.build429Response(decision);

  // Apply rate limit headers to the response
  const headers = tieredLimiter.buildHeaders(decision);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  // Also set correlation ID
  setCorrelationId(response, request);

  return response;
}

// ─── header helpers ───────────────────────────────────────────────────────────

const CORRELATION_ID_HEADER = 'x-correlation-id';

function setCorrelationId(response: NextResponse, request: NextRequest): void {
  const id = request.headers.get(CORRELATION_ID_HEADER) || generateCorrelationId();
  response.headers.set(CORRELATION_ID_HEADER, id);
  response.headers.set('X-Correlation-ID', id);
}