import { NextRequest, NextResponse } from 'next/server';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = readPositiveInteger(
  process.env.CRASHLAB_API_RATE_LIMIT_WINDOW_MS,
  DEFAULT_WINDOW_MS,
);
const RATE_LIMIT_MAX_REQUESTS = readPositiveInteger(
  process.env.CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_MAX_REQUESTS,
);

const globalForRateLimit = globalThis as unknown as {
  crashlabApiRateLimitBuckets?: Map<string, RateLimitBucket>;
  crashlabApiRateLimitLastCleanup?: number;
};

const buckets =
  globalForRateLimit.crashlabApiRateLimitBuckets ??
  new Map<string, RateLimitBucket>();

globalForRateLimit.crashlabApiRateLimitBuckets = buckets;

export function proxy(request: NextRequest): NextResponse {
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const now = Date.now();
  cleanupExpiredBuckets(now);

  const key = clientKey(request);
  const bucket = currentBucket(key, now);
  bucket.count += 1;

  const remaining = Math.max(RATE_LIMIT_MAX_REQUESTS - bucket.count, 0);
  const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const response = NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many requests. Please retry after the rate limit resets.',
      },
      { status: 429 },
    );

    response.headers.set('Retry-After', String(Math.max(resetSeconds, 1)));
    setRateLimitHeaders(response, remaining, bucket.resetAt, now);
    return response;
  }

  const response = NextResponse.next();
  setRateLimitHeaders(response, remaining, bucket.resetAt, now);
  return response;
}

function currentBucket(key: string, now: number): RateLimitBucket {
  const existing = buckets.get(key);

  if (existing && existing.resetAt > now) {
    return existing;
  }

  const bucket = {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };

  buckets.set(key, bucket);
  return bucket;
}

function clientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();

  return clientIp || realIp || 'unknown';
}

function cleanupExpiredBuckets(now: number): void {
  const lastCleanup = globalForRateLimit.crashlabApiRateLimitLastCleanup ?? 0;

  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  globalForRateLimit.crashlabApiRateLimitLastCleanup = now;
}

function setRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: number,
  now: number,
): void {
  response.headers.set('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  response.headers.set('RateLimit-Remaining', String(remaining));
  response.headers.set(
    'RateLimit-Reset',
    String(Math.max(Math.ceil((resetAt - now) / 1000), 0)),
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
