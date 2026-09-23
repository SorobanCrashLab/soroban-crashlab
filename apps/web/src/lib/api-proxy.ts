import { NextResponse } from 'next/server';
import { successResponse, errorResponse, status } from './api-response-utils';

function hasField(value: unknown, field: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && field in value;
}

function getErrorString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    return value.map(getErrorString).filter((entry): entry is string => entry !== undefined)[0];
  }
  for (const field of ['error', 'message', 'detail', 'description']) {
    if (hasField(value, field)) {
      const entry = getErrorString(value[field]);
      if (entry !== undefined) {
        return entry;
      }
    }
  }
  return undefined;
}

async function readUpstreamError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) {
      return `Upstream error (${res.status})`;
    }
    try {
      const upstreamError = getErrorString(JSON.parse(text));
      if (upstreamError !== undefined) {
        return upstreamError;
      }
    } catch {
      // Not JSON; fall through to raw text below.
    }
    return `Upstream error (${res.status}): ${text.slice(0, 500)}`;
  } catch {
    return `Upstream error (${res.status})`;
  }
}

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
      return errorResponse(await readUpstreamError(res), res.status);
    } catch {
      return errorResponse('Backend unavailable', status.serviceUnavailable);
    }
  }
  return fallback();
}
