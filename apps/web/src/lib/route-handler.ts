import { NextResponse } from 'next/server';
import { logger } from './logger';
import { checkRequestSize, RequestSizeLimitConfig } from './request-size-limits';

function isResponseLike(value: unknown): value is Response {
  return value instanceof Response || (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as { status?: unknown }).status === 'number'
  );
}

/**
 * Standard error envelope returned by API routes: { error: string }.
 */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parses a request body as JSON, returning a 400 jsonError response instead
 * of throwing when the body is missing or malformed.
 */
export async function readJsonBody(
  request: Request,
): Promise<{ body: unknown } | { error: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { error: jsonError('Request body must be valid JSON.', 400) };
  }
}

function ensureRouteResponse(value: unknown, fallbackMessage: string): Response {
  if (isResponseLike(value)) {
    return value as Response;
  }

  logger.error('Route handler returned an invalid response payload', { value });
  return jsonError(fallbackMessage, 500);
}

/**
 * Wraps a route handler so any uncaught exception is logged and converted
 * into a consistent 500 { error } response instead of an unhandled
 * exception (which Next.js would otherwise render as an opaque HTML page).
 */
export function withRouteErrorHandling<Args extends unknown[]>(
  routeLabel: string,
  handler: (...args: Args) => Promise<Response>,
  fallbackMessage = 'An unexpected error occurred.',
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      const response = await handler(...args);
      return ensureRouteResponse(response, fallbackMessage);
    } catch (error) {
      logger.error(`${routeLabel} failed`, { error });
      return jsonError(fallbackMessage, 500);
    }
  };
}

/**
 * Wraps a route handler with request size limit checking and structured logging.
 * Ensures requests respect configured size limits and logs structured trace data.
 */
export function withSizeLimitAndLogging<Args extends unknown[]>(
  routeLabel: string,
  handler: (...args: Args) => Promise<Response>,
  sizeConfig?: RequestSizeLimitConfig,
  fallbackMessage = 'An unexpected error occurred.',
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const request = args[0] as Request | undefined;
    const startTime = Date.now();

    try {
      // Check request size limits
      if (request) {
        const sizeCheckError = checkRequestSize(request, sizeConfig);
        if (sizeCheckError) {
          const duration = Date.now() - startTime;
          logger.info(`${routeLabel} rejected (size limit)`, {
            status: 413,
            duration_ms: duration,
            content_length: request.headers.get('content-length'),
          });
          return sizeCheckError;
        }
      }

      const response = ensureRouteResponse(await handler(...args), fallbackMessage);
      const duration = Date.now() - startTime;

      logger.info(`${routeLabel} completed`, {
        status: response.status,
        duration_ms: duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${routeLabel} failed`, {
        error,
        duration_ms: duration,
      });
      return jsonError(fallbackMessage, 500);
    }
  };
}
