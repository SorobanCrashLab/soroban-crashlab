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
export function jsonError(message: string, status: number, requestId?: string): NextResponse {
  return NextResponse.json({ error: message, ...(requestId ? { requestId } : {}) }, { status });
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
    const requestId = request.headers.get('x-request-id') || undefined;
    return { error: jsonError('Request body must be valid JSON.', 400, requestId) };
  }
}

function ensureRouteResponse(value: unknown, fallbackMessage: string, requestId?: string): Response {
  if (isResponseLike(value)) {
    return value as Response;
  }

  logger.error('Route handler returned an invalid response payload', { value });
  return jsonError(fallbackMessage, 500, requestId);
}

/**
 * Wraps a route handler so any uncaught exception is logged and converted
 * into a consistent 500 { error } response instead of an unhandled
 * exception (which Next.js would otherwise render as an opaque HTML page).
 *
 * When `enforceSizeLimit` is true (default), requests whose `content-length`
 * exceeds the configured limits are rejected with a standardized 413 before
 * the handler runs, giving every wrapped route uniform body-size enforcement.
 */
export function withRouteErrorHandling<Args extends unknown[]>(
  routeLabel: string,
  handler: (...args: Args) => Promise<Response>,
  fallbackMessage = 'An unexpected error occurred.',
  enforceSizeLimit = true,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    let requestId: string | undefined = undefined;
    try {
      const request = args[0];
      if (request instanceof Request) {
        requestId = request.headers.get('x-request-id') || undefined;
        if (enforceSizeLimit) {
          const sizeError = checkRequestSize(request);
          if (sizeError) {
            return sizeError;
          }
        }
      }
      const response = await handler(...args);
      return ensureRouteResponse(response, fallbackMessage, requestId);
    } catch (error) {
      logger.error(`${routeLabel} failed`, { error });
      return jsonError(fallbackMessage, 500, requestId);
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
    const requestId = request?.headers.get('x-request-id') || undefined;

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

      const response = ensureRouteResponse(await handler(...args), fallbackMessage, requestId);
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
      return jsonError(fallbackMessage, 500, requestId);
    }
  };
}

import { z } from 'zod';

export interface RouteConfig<BodySchema extends z.ZodTypeAny = z.ZodTypeAny> {
  label: string;
  bodySchema?: BodySchema;
  sizeLimit?: RequestSizeLimitConfig | boolean;
  rateLimitClass?: string;
  fallbackMessage?: string;
}

export function createRouteHandler<
  BodySchema extends z.ZodTypeAny = z.ZodNever,
  Params = unknown
>(
  config: RouteConfig<BodySchema>,
  handler: (
    req: Request,
    context: {
      params: Promise<Params>;
      body: z.infer<BodySchema>;
    }
  ) => Promise<Response>
) {
  return async (
    request: Request,
    context: { params?: Promise<Params> | Params }
  ): Promise<Response> => {
    const startTime = Date.now();
    try {
      if (config.sizeLimit !== false) {
        const sizeConfig = typeof config.sizeLimit === 'object' ? config.sizeLimit : undefined;
        const sizeCheckError = checkRequestSize(request, sizeConfig);
        if (sizeCheckError) {
          logger.info(`${config.label} rejected (size limit)`, {
            status: 413,
            duration_ms: Date.now() - startTime,
            content_length: request.headers.get('content-length'),
          });
          return sizeCheckError;
        }
      }

      let parsedBody: unknown = undefined;
      if (config.bodySchema) {
        const bodyResult = await readJsonBody(request);
        if ('error' in bodyResult) return bodyResult.error as Response;
        
        const parseResult = config.bodySchema.safeParse(bodyResult.body);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: 'Invalid request body', details: parseResult.error.format() },
            { status: 400 }
          );
        }
        parsedBody = parseResult.data;
      }

      const paramsPromise = context?.params instanceof Promise 
        ? context.params 
        : Promise.resolve(context?.params ?? ({} as Params));

      const response = await handler(request, {
        params: paramsPromise,
        body: parsedBody as z.infer<BodySchema>,
      });

      const fallbackMsg = config.fallbackMessage || 'An unexpected error occurred.';
      const ensRes = ensureRouteResponse(response, fallbackMsg);

      logger.info(`${config.label} completed`, {
        status: ensRes.status,
        duration_ms: Date.now() - startTime,
      });

      return ensRes;
    } catch (error) {
      logger.error(`${config.label} failed`, {
        error,
        duration_ms: Date.now() - startTime,
      });
      return jsonError(config.fallbackMessage || 'An unexpected error occurred.', 500);
    }
  };
}