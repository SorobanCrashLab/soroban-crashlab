import { NextRequest, NextResponse } from 'next/server';
import { proxy as rateLimitProxy } from './rate-limit';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Next.js 16 proxy entry (successor to middleware.ts). Applies API rate
 * limiting via `proxy` from ./rate-limit and stamps every API response with a
 * correlation ID so requests can be traced end to end.
 */
export function proxy(request: NextRequest): NextResponse {
  const response = rateLimitProxy(request);

  // Add correlation ID for request tracking
  const correlationId = request.headers.get(CORRELATION_ID_HEADER) || generateCorrelationId();
  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  // Store correlation ID in response headers for client access
  response.headers.set('X-Correlation-ID', correlationId);

  return response;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${Math.random().toString(36).substring(2, 11)}`;
}

export const config = {
  matcher: ['/api/:path*'],
};

