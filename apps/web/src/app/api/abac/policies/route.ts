import { NextRequest, NextResponse } from 'next/server';
import { selectPolicyStore } from '@/lib/abac/policies/PolicyStore';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const tag = searchParams.get('tag') ?? undefined;
    const resourceScope = searchParams.get('resourceScope') ?? undefined;
    const teamScope = searchParams.get('teamScope') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const store = selectPolicyStore();
    const policies = await store.listPolicies({
      activeOnly,
      tag,
      resourceScope,
      teamScope,
      limit,
      offset,
    });

    return NextResponse.json({ policies });
  } catch (error) {
    logger.error('Failed to list policies', { error });
    return NextResponse.json(
      { error: 'Failed to list policies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, version, cedarCode, regoCode, tags, resourceScope, teamScope, active } = body;

    // Validate required fields
    if (!name || !version || !cedarCode) {
      return NextResponse.json(
        { error: 'Missing required fields: name, version, cedarCode' },
        { status: 400 }
      );
    }

    const store = selectPolicyStore();

    // Validate the policy first
    const validation = await store.validatePolicy(cedarCode);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Policy validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const policy = await store.createPolicy({
      id,
      name,
      description,
      version,
      cedarCode,
      regoCode,
      tags,
      resourceScope,
      teamScope,
      active: active ?? true,
    });

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    logger.error('Failed to create policy', { error });
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}