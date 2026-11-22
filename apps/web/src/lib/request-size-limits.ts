import { NextResponse } from 'next/server';

export interface RequestSizeLimitConfig {
  maxBodySize?: number; // in bytes
  maxJsonSize?: number; // in bytes
  maxFormDataSize?: number; // in bytes
}

const DEFAULT_CONFIG: Required<RequestSizeLimitConfig> = {
  maxBodySize: parseInt(process.env.MAX_REQUEST_SIZE || '10485760', 10), // 10MB
  maxJsonSize: parseInt(process.env.MAX_JSON_SIZE || '1048576', 10), // 1MB
  maxFormDataSize: parseInt(process.env.MAX_FORM_DATA_SIZE || '1048576', 10), // 1MB
};

const KIB = 1024;
const MIB = 1024 * KIB;
const UPLOAD_BODY_LIMIT = 20 * MIB;

/**
 * Route classes (#1572). Every API request body belongs to exactly one class,
 * so limits are uniform within a class and explicit at the choke point instead
 * of being rediscovered in individual handlers.
 */
export const REQUEST_SIZE_LIMIT_CLASSES = Object.freeze({
  // Inbound third-party events: small, high-volume, untrusted.
  webhook: Object.freeze({ maxBodySize: 1 * MIB, maxJsonSize: 256 * KIB, maxFormDataSize: 1 * MIB }),
  // Artifact / bundle uploads: deliberately the largest class, bounded to 20 MiB.
  artifact: Object.freeze({ maxBodySize: UPLOAD_BODY_LIMIT, maxJsonSize: 1 * MIB, maxFormDataSize: UPLOAD_BODY_LIMIT }),
  // Maintainer settings writes: tiny payloads, low risk of legitimate bulk.
  settings: Object.freeze({ maxBodySize: 256 * KIB, maxJsonSize: 128 * KIB, maxFormDataSize: 256 * KIB }),
  // Everything else inherits the environment-tunable defaults.
  default: Object.freeze({ ...DEFAULT_CONFIG }),
} satisfies Record<string, Required<RequestSizeLimitConfig>>);

export type RequestSizeRouteClass = keyof typeof REQUEST_SIZE_LIMIT_CLASSES;

/** Maps an API pathname to its request-size class. */
export function routeClassFor(pathname: string): RequestSizeRouteClass {
  if (/^\/api\/(webhooks|integrations)(\/|$)/.test(pathname)) return 'webhook';
  if (/^\/api\/(artifacts|uploadthing)(\/|$)/.test(pathname)) return 'artifact';
  if (/^\/api\/settings(\/|$)/.test(pathname)) return 'settings';
  return 'default';
}

/** Safe variant for request mocks that do not expose a URL. */
export function routeClassForRequest(request: Request): RequestSizeRouteClass {
  let pathname = '';
  try {
    if (request.url) pathname = new URL(request.url).pathname;
  } catch {
    pathname = '';
  }
  return routeClassFor(pathname);
}

const BODY_IDLE_TIMEOUT_MS = 10_000;
const BODY_TOTAL_TIMEOUT_MS = 60_000;

type BodyLimitFailure = 'too-large' | 'idle-timeout' | 'deadline';

/** Raised when a route consumes a request stream beyond its configured budget. */
export class RequestBodyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Request body exceeds maximum allowed size of ${limit} bytes`);
    this.name = 'RequestBodyLimitError';
  }
}

/** Raised when a client stalls while uploading a request body. */
export class RequestBodyTimeoutError extends Error {
  constructor(readonly reason: 'idle-timeout' | 'deadline') {
    super(reason === 'idle-timeout' ? 'Request body upload was idle too long' : 'Request body upload exceeded its deadline');
    this.name = 'RequestBodyTimeoutError';
  }
}

export interface LimitedRequestBody {
  request: Request;
  failure: () => BodyLimitFailure | null;
}

export function effectiveRequestBodyLimit(request: Request, config: RequestSizeLimitConfig): number {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const maxBody = config.maxBodySize ?? DEFAULT_CONFIG.maxBodySize;
  if (contentType.includes('application/json')) return Math.min(maxBody, config.maxJsonSize ?? DEFAULT_CONFIG.maxJsonSize);
  if (contentType.includes('multipart/form-data')) return Math.min(maxBody, config.maxFormDataSize ?? DEFAULT_CONFIG.maxFormDataSize);
  return maxBody;
}

/** Returns the byte caps for a route class, merged with environment defaults. */
export function requestSizeConfigForClass(routeClass: RequestSizeRouteClass): Required<RequestSizeLimitConfig> {
  return { ...DEFAULT_CONFIG, ...REQUEST_SIZE_LIMIT_CLASSES[routeClass] };
}

/** Resolves the class (and therefore the caps) for an incoming request. */
export function requestSizeConfigFor(
  request: Request,
  routeClass: RequestSizeRouteClass = routeClassForRequest(request),
): RequestSizeLimitConfig {
  return requestSizeConfigForClass(routeClass);
}

/**
 * Adds a counting stream in front of a route's body parser. The stream aborts
 * immediately when it crosses the route budget and enforces both idle and total
 * upload deadlines without buffering the complete request first.
 */
export function limitRequestBody(request: Request, config = requestSizeConfigFor(request)): LimitedRequestBody {
  const limit = effectiveRequestBodyLimit(request, config);
  if (!request.body || ['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    return { request, failure: () => null };
  }

  const reader = request.body.getReader();
  const startedAt = Date.now();
  let consumed = 0;
  let failed: BodyLimitFailure | null = null;

  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const remainingMs = BODY_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        failed = 'deadline';
        await reader.cancel();
        controller.error(new RequestBodyTimeoutError('deadline'));
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timedRead = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new RequestBodyTimeoutError(
            remainingMs < BODY_IDLE_TIMEOUT_MS ? 'deadline' : 'idle-timeout',
          )), Math.min(BODY_IDLE_TIMEOUT_MS, remainingMs));
        });
        const item = await Promise.race([reader.read(), timedRead]);
        if (timer) clearTimeout(timer);
        if (item.done) {
          controller.close();
          return;
        }
        consumed += item.value.byteLength;
        if (consumed > limit) {
          failed = 'too-large';
          await reader.cancel();
          controller.error(new RequestBodyLimitError(limit));
          return;
        }
        controller.enqueue(item.value);
      } catch (error) {
        if (timer) clearTimeout(timer);
        if (error instanceof RequestBodyTimeoutError) failed = error.reason;
        await reader.cancel(error).catch(() => undefined);
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: boundedBody,
    signal: request.signal,
    // Node's Fetch implementation requires duplex for a streamed body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  // Keep NextRequest's URL/cookie helpers while routing body-consuming methods
  // through the bounded stream.
  const proxiedRequest = new Proxy(request, {
    get(target, property) {
      if (property === 'body' || property === 'bodyUsed') return Reflect.get(boundedRequest, property);
      if (['arrayBuffer', 'blob', 'formData', 'json', 'text'].includes(String(property))) {
        const method = Reflect.get(boundedRequest, property);
        return typeof method === 'function' ? method.bind(boundedRequest) : method;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Request;

  return { request: proxiedRequest, failure: () => failed };
}

/** Converts a stream failure into the endpoint's standard error response. */
export function requestBodyFailureResponse(failure: BodyLimitFailure | null, limit?: number): NextResponse | null {
  if (failure === 'too-large') {
    return standardSizeLimitResponse(`Request body exceeds maximum allowed size of ${limit ?? DEFAULT_CONFIG.maxBodySize} bytes`, limit);
  }
  if (failure) {
    return NextResponse.json({ error: 'Request body upload timed out', code: 'REQUEST_BODY_TIMEOUT' }, { status: 408 });
  }
  return null;
}

export function requestBodyErrorResponse(error: unknown, limit?: number): NextResponse | null {
  if (error instanceof RequestBodyLimitError) {
    return standardSizeLimitResponse(error.message, error.limit ?? limit);
  }
  if (error instanceof RequestBodyTimeoutError) {
    return NextResponse.json({ error: error.message, code: 'REQUEST_BODY_TIMEOUT' }, { status: 408 });
  }
  return null;
}

/**
 * The effective default limits, shared with the upload ingestion gate
 * (#1636) so uploaded artifacts obey the same caps as request bodies.
 */
export const DEFAULT_REQUEST_SIZE_LIMITS: Readonly<Required<RequestSizeLimitConfig>> = Object.freeze({
  ...DEFAULT_CONFIG,
});

/**
 * Standard 413 payload emitted by every route that enforces body size limits so
 * clients can rely on a uniform `code` when surfacing "payload too large" errors.
 */
export function standardSizeLimitResponse(
  message: string,
  limitBytes?: number,
  actualBytes?: number,
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'PAYLOAD_TOO_LARGE',
      ...(typeof limitBytes === 'number' ? { limit: limitBytes } : {}),
      ...(typeof actualBytes === 'number' ? { actual: actualBytes } : {}),
    },
    { status: 413 },
  );
}

export function checkRequestSize(
  request: Request,
  config: RequestSizeLimitConfig = requestSizeConfigFor(request),
): NextResponse | null {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return null; // No size limit check possible without content-length
  }

  const size = parseInt(contentLength, 10);
  if (isNaN(size)) {
    return null;
  }

  const contentType = request.headers.get('content-type') || '';

  const maxBody = config.maxBodySize ?? DEFAULT_CONFIG.maxBodySize!;
  if (size > maxBody) {
    return standardSizeLimitResponse(
      `Request body exceeds maximum allowed size of ${maxBody} bytes`,
      maxBody,
      size,
    );
  }

  if (contentType.includes('application/json')) {
    const maxJson = Math.min(maxBody, config.maxJsonSize ?? DEFAULT_CONFIG.maxJsonSize!);
    if (size > maxJson) {
      return standardSizeLimitResponse(
        `JSON payload exceeds maximum allowed size of ${maxJson} bytes`,
        maxJson,
        size,
      );
    }
  }

  if (contentType.includes('multipart/form-data')) {
    const maxFormData = Math.min(maxBody, config.maxFormDataSize ?? DEFAULT_CONFIG.maxFormDataSize!);
    if (size > maxFormData) {
      return standardSizeLimitResponse(
        `Form data exceeds maximum allowed size of ${maxFormData} bytes`,
        maxFormData,
        size,
      );
    }
  }

  return null;
}
