/**
 * API Gateway Hardening — Tiered Limiter Facade
 *
 * High-level interface for applying tiered rate limits with automatic
 * identity resolution and policy selection. Integrates with existing
 * RBAC and route catalog systems.
 */

import { NextRequest } from 'next/server';
import { RateLimitEngine, IdentityContext, RateLimitCheckResult } from './RateLimitEngine';
import { RateLimitPolicy, DEFAULT_GATEWAY_POLICIES } from './policies';
import { resolveRouteClass } from '@/lib/rate-limit';
import { resolvePrincipal, RbacPrincipal } from '@/lib/rbac';
import { matchRouteCatalogEntry } from '@/lib/route-catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TieredLimitDecision {
  allowed: boolean;
  result: RateLimitCheckResult;
  principal: RbacPrincipal;
  routeClass: string;
}

export interface TieredLimiterConfig {
  /** Custom policies (uses defaults if not provided) */
  policies?: RateLimitPolicy;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom identity resolver */
  resolveIdentity?: (request: NextRequest, principal: RbacPrincipal) => Promise<IdentityContext>;
}

/**
 * Default identity resolver using RBAC principal
 */
async function defaultResolveIdentity(
  request: NextRequest,
  principal: RbacPrincipal
): Promise<IdentityContext> {
  // Extract IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const ip = clientIp || realIp || 'unknown';

  return {
    ip,
    userId: principal.subject.startsWith('github:') || principal.subject.startsWith('oidc:')
      ? principal.subject
      : undefined,
    apiKeyId: principal.subject.startsWith('api-key:') ? principal.subject : undefined,
    tenantId: principal.tenantId,
  };
}

// ─── TieredLimiter Class ──────────────────────────────────────────────────────

export class TieredLimiter {
  private engine: RateLimitEngine;
  private config: Required<TieredLimiterConfig>;

  constructor(config: TieredLimiterConfig = {}) {
    this.engine = new RateLimitEngine({ rateLimit: config.policies ?? DEFAULT_GATEWAY_POLICIES.rateLimit });
    this.config = {
      policies: config.policies ?? DEFAULT_GATEWAY_POLICIES.rateLimit,
      debug: config.debug ?? false,
      resolveIdentity: config.resolveIdentity ?? defaultResolveIdentity,
    };
  }

  /**
   * Check rate limits for a request
   * This is the main entry point for middleware integration
   */
  async check(request: NextRequest): Promise<TieredLimitDecision> {
    const startTime = Date.now();

    // Resolve principal (authentication + authorization)
    const principal = await resolvePrincipal(request);

    // Determine route class for policy selection
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const routeClass = resolveRouteClass(method, pathname);

    // Get applicable policy
    const policy = this.config.policies[routeClass] ?? this.config.policies.default;

    // Resolve identity context for tiered limiting
    const identity = await this.config.resolveIdentity(request, principal);

    // Check rate limits
    const result = await this.engine.check(
      identity,
      method,
      pathname,
      routeClass,
      policy.endpointCosts?.[pathname] ?? 1
    );

    const decision: TieredLimitDecision = {
      allowed: result.allowed,
      result,
      principal,
      routeClass,
    };

    if (this.config.debug) {
      const duration = Date.now() - startTime;
      console.log(`[TieredLimiter] ${method} ${pathname} ${result.allowed ? 'ALLOWED' : 'DENIED'}`, {
        tier: result.tier,
        policy: routeClass,
        remaining: result.remaining,
        retryAfter: result.retryAfter,
        principal: principal.subject,
        durationMs: duration,
      });
    }

    return decision;
  }

  /**
   * Quick check without full identity resolution (for internal use)
   */
  async quickCheck(
    identity: IdentityContext,
    method: string,
    pathname: string,
    policyClass: string = 'default'
  ): Promise<RateLimitCheckResult> {
    const policy = this.config.policies[policyClass] ?? this.config.policies.default;
    return this.engine.check(
      identity,
      method,
      pathname,
      policyClass,
      policy.endpointCosts?.[pathname] ?? 1
    );
  }

  /**
   * Get the RateLimitEngine for advanced operations
   */
  getEngine(): RateLimitEngine {
    return this.engine;
  }

  /**
   * Build response headers from decision
   */
  buildHeaders(decision: TieredLimitDecision): Record<string, string> {
    return this.engine.buildHeaders(decision.result);
  }

  /**
   * Build 429 response from decision
   */
  build429Response(decision: TieredLimitDecision): Response {
    const response = this.engine.build429Response(decision.result);
    const res = new Response(JSON.stringify({ error: response.message, code: response.code }), {
      status: response.status,
      headers: response.headers,
    });
    return res;
  }

  /**
   * Apply rate limit headers to a NextResponse
   */
  applyHeaders(response: Response, decision: TieredLimitDecision): Response {
    const headers = this.buildHeaders(decision);
    const newResponse = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) {
      newResponse.headers.set(key, value);
    }
    return newResponse;
  }

  /**
   * Check if route is in catalog (for early rejection of undeclared routes)
   */
  isDeclaredRoute(request: NextRequest): boolean {
    const entry = matchRouteCatalogEntry(request.method, request.nextUrl.pathname);
    return entry !== null;
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let limiterInstance: TieredLimiter | null = null;

export function getTieredLimiter(config?: TieredLimiterConfig): TieredLimiter {
  if (!limiterInstance) {
    limiterInstance = new TieredLimiter(config);
  }
  return limiterInstance;
}

export function resetTieredLimiter(): void {
  limiterInstance = null;
}

// ─── Middleware Helper ────────────────────────────────────────────────────────

/**
 * Creates a middleware function that applies tiered rate limiting
 * Usage: export const middleware = createRateLimitMiddleware();
 */
export function createRateLimitMiddleware(limiter?: TieredLimiter) {
  const tieredLimiter = limiter ?? getTieredLimiter();

  return async function rateLimitMiddleware(request: NextRequest): Promise<Response | null> {
    // Skip non-API routes
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return null;
    }

    // Skip OPTIONS requests
    if (request.method === 'OPTIONS') {
      return null;
    }

    // Check if route is declared (early rejection for undeclared routes)
    if (!tieredLimiter.isDeclaredRoute(request)) {
      // Let route-guard handle this
      return null;
    }

    try {
      const decision = await tieredLimiter.check(request);

      if (!decision.allowed) {
        return tieredLimiter.build429Response(decision);
      }

      // Request allowed - return null to continue, but we need to attach headers
      // The actual response will be decorated by the proxy
      return null;
    } catch (error) {
      console.error('[TieredLimiter] Middleware error:', error);
      // Fail-open: allow request through on limiter errors
      return null;
    }
  };
}