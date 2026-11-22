import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';

/**
 * Compute a strong ETag from a serialized JSON payload.
 * The buffer is computed once — no double serialization cost.
 */
export function computeETag(body: string): string {
  const hash = createHash('sha256').update(body).digest('hex');
  return `"${hash}"`;
}

/**
 * Wrap a deterministic fixture response with Cache-Control and ETag headers.
 * Handles If-None-Match → 304 conditional requests.
 * Proxy-mode responses must bypass this entirely.
 *
 * Takes a plain `Request` rather than `NextRequest`: only the conditional
 * header is read, and route handlers wrapped by `withRouteErrorHandling`
 * receive the base type.
 */
export function withFixtureCaching(
  request: Pick<Request, 'headers'>,
  data: unknown,
): NextResponse {
  const body = JSON.stringify(data);
  const etag = computeETag(body);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': CACHE_CONTROL,
      ETag: etag,
    },
  });
}
