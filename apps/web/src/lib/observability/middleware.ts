// Issue #1844: Request middleware for trace correlation and metrics collection
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { metrics } from './metrics';
import { formatTraceparent, parseTraceparent, startSpan } from './tracing';

export function observabilityMiddleware(req: NextRequest): NextResponse {
  const requestId = req.headers.get('x-request-id') || randomUUID();
  const traceparent = req.headers.get('traceparent');
  const incomingContext = parseTraceparent(traceparent);
  const traceId = incomingContext?.traceId || req.headers.get('x-trace-id') || randomUUID();
  const route = req.nextUrl.pathname;
  
  // Set correlation IDs in logger context
  logger.setContext({ requestId, traceId, route });
  
  const startTime = Date.now();
  const span = startSpan(`HTTP ${req.method}`, { 'http.method': req.method, 'http.route': route, 'campaign.id': req.headers.get('x-campaign-id') ?? undefined }, incomingContext ?? undefined);
  
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
  response.headers.set('traceparent', formatTraceparent(span.context));

  // Record metrics
  const durationMs = Date.now() - startTime;
  const isError = response.status >= 400;
  
  metrics.recordRequest(route, durationMs, isError);
  
  span.end({ 'http.status_code': response.status, 'duration_ms': durationMs });
  logger.info('Request completed', {
    status: response.status,
    durationMs,
    traceId: span.context.traceId,
    spanId: span.context.spanId,
  });

  // Clear context after request
  logger.clearContext();

  return response;
}
