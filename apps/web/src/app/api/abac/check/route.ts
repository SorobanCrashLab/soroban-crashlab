import { NextRequest, NextResponse } from 'next/server';
import { PolicyEvaluator } from '@/lib/abac/PolicyEngine';
import type { ContextAttributes, PrincipalAttributes, Resource } from '@/lib/abac/attributes';
import { logAuthorizationEvent } from '@/lib/abac/audit/AuditLogger';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { action, resource, context, principal } = body;

    // Validate required fields
    if (!action || !resource) {
      return NextResponse.json(
        { error: 'Missing required fields: action and resource' },
        { status: 400 }
      );
    }

    // Build the principal from request or use provided
    let evalPrincipal: PrincipalAttributes;
    if (principal) {
      evalPrincipal = principal;
    } else {
      // Extract from auth context (would be populated by auth middleware)
      evalPrincipal = {
        id: 'anonymous',
        identityType: 'anonymous',
        subject: 'anonymous',
        roles: ['guest'],
        teams: [],
        groups: [],
        riskScore: 100,
        mfaVerified: false,
        lastLogin: Date.now(),
      };
    }

    // Build context
    const evalContext: ContextAttributes = {
      time: Date.now(),
      ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined,
      location: undefined,
      device: request.headers.get('user-agent') ?? undefined,
      mfaVerified: false,
      requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
      isDryRun: body.dryRun ?? false,
      ...context,
    };

    // Evaluate policy
    const evaluator = PolicyEvaluator.getInstance();
    const decision = await evaluator.evaluate({
      principal: evalPrincipal,
      action,
      resource,
      context: evalContext,
    });

    const latencyMs = Date.now() - startTime;

    // Log the authorization decision
    await logAuthorizationEvent({
      principal: {
        id: evalPrincipal.id,
        identityType: evalPrincipal.identityType,
        subject: evalPrincipal.subject,
        authenticated: evalPrincipal.identityType !== 'anonymous',
      },
      action,
      resource: {
        type: resource.type,
        id: String((resource.attributes as Record<string, unknown>).id ?? 'unknown'),
        attributes: resource.attributes,
      },
      decision: decision.permitted ? 'permit' : 'deny',
      reason: decision.reason,
      policyId: decision.policyId,
      latencyMs,
    });

    return NextResponse.json(decision, {
      status: decision.permitted ? 200 : 403,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.error('ABAC check failed', { error });

    await logAuthorizationEvent({
      principal: {
        id: 'error',
        identityType: 'anonymous',
        subject: 'error',
        authenticated: false,
      },
      action: 'error',
      resource: {
        type: 'unknown',
        id: 'unknown',
      },
      decision: 'deny',
      reason: error instanceof Error ? error.message : 'Unknown error',
      latencyMs,
    });

    return NextResponse.json(
      { permitted: false, reason: 'Internal server error' },
      { status: 500 }
    );
  }
}