// Issue #1844: Request middleware for trace correlation and metrics collection
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { metrics } from './metrics';

export function observabilityMiddleware(req: NextRequest): NextResponse {
  const requestId = req.headers.get('x-request-id') || randomUUID();
  const traceId = req.headers.get('x-trace-id') || randomUUID();
  const route = req.nextUrl.pathname;
  
  // Set correlation IDs in logger context
  logger.setContext({ requestId, traceId, route });
  
  const startTime = Date.now();
  
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.headers.get('user-agent'),
  });

  // Continue with request
  const response = NextResponse.next();
  
  // Add correlation headers to response
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-trace-id', traceId);

  // Record metrics
  const durationMs = Date.now() - startTime;
  const isError = response.status >= 400;
  
  metrics.recordRequest(route, durationMs, isError);
  
  logger.info('Request completed', {
    status: response.status,
    durationMs,
  });

  // Clear context after request
  logger.clearContext();

  return response;
}
