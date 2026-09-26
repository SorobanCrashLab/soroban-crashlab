import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxy } from '@/rate-limit';

export async function middleware(request: NextRequest) {
  let requestId = request.headers.get('x-request-id');

  if (!requestId) {
    requestId = crypto.randomUUID();
  }

  // Apply rate limiting to unauthenticated mutating routes
  if (isMutatingRequest(request)) {
    const rateLimitResponse = await proxy(request);
    if (rateLimitResponse.status === 429) {
      return rateLimitResponse;
    }
  }

  const response = NextResponse.next();

  // Stamp the request ID on the request headers so downstream route handlers
  // and the structured logger (via next/headers) can read it.
  request.headers.set('x-request-id', requestId);

  // Also stamp it on the response for the client to see.
  response.headers.set('x-request-id', requestId);

  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

function isMutatingRequest(request: NextRequest): boolean {
  const method = request.method;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

// Optionally config to run only on API paths if desired, but running on all is fine
export const config = {
  matcher: '/api/:path*',
};
