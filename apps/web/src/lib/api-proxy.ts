import { NextResponse } from 'next/server';
import { successResponse, errorResponse, status } from './api-response-utils';

export async function tryBackend(
  backendUrl: string | undefined,
  path: string,
  options: RequestInit,
  fallback: () => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}${path}`, {
        ...options,
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return successResponse(data);
      }
      return errorResponse(`Upstream error`, res.status);
    } catch {
      return errorResponse('Backend unavailable', status.serviceUnavailable);
    }
  }
  return fallback();
}
