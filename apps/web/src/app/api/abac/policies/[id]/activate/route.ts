import { NextRequest, NextResponse } from 'next/server';
import { selectPolicyStore } from '@/lib/abac/policies/PolicyStore';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = selectPolicyStore();
    const success = await store.activatePolicy(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, activePolicyId: id });
  } catch (error) {
    logger.error('Failed to activate policy', { error });
    return NextResponse.json(
      { error: 'Failed to activate policy' },
      { status: 500 }
    );
  }
}