import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  let requestId = request.headers.get('x-request-id');
  
  if (!requestId) {
    requestId = crypto.randomUUID();
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

// Optionally config to run only on API paths if desired, but running on all is fine
export const config = {
  matcher: '/api/:path*',
};
