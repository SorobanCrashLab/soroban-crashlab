import { NextResponse } from 'next/server';
import { logger } from './logger';

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

/**
 * Wraps a route handler so any uncaught exception is logged and converted
 * into a consistent 500 { error } response instead of an unhandled
 * exception (which Next.js would otherwise render as an opaque HTML page).
 */
export function withRouteErrorHandling<Args extends unknown[]>(
  routeLabel: string,
  handler: (...args: Args) => Promise<NextResponse>,
  fallbackMessage = 'An unexpected error occurred.',
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error(`${routeLabel} failed`, { error });
      return jsonError(fallbackMessage, 500);
    }
  };
}
