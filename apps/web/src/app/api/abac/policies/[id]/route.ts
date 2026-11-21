import { NextRequest, NextResponse } from 'next/server';
import { selectPolicyStore } from '@/lib/abac/policies/PolicyStore';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = selectPolicyStore();
    const policy = await store.getPolicy(id);

    if (!policy) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(policy);
  } catch (error) {
    logger.error('Failed to get policy', { error });
    return NextResponse.json(
      { error: 'Failed to get policy' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { force, validate, ...updates } = body;

    const store = selectPolicyStore();
    const existing = await store.getPolicy(id);

    if (!existing) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    // Validate if requested
    if (validate && updates.cedarCode) {
      const validation = await store.validatePolicy(updates.cedarCode);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'Policy validation failed', details: validation.errors },
          { status: 400 }
        );
      }
    }

    // Force update if content differs
    if (!force && existing) {
      if (existing.cedarCode === updates.cedarCode && existing.version === updates.version) {
        return NextResponse.json({ updated: false, policy: existing });
      }
    }

    const updated = await store.updatePolicy(id, {
      ...updates,
      validated: !validate,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ updated: true, policy: updated });
  } catch (error) {
    logger.error('Failed to update policy', { error });
    return NextResponse.json(
      { error: 'Failed to update policy' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = selectPolicyStore();
    const deleted = await store.deletePolicy(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete policy', { error });
    return NextResponse.json(
      { error: 'Failed to delete policy' },
      { status: 500 }
    );
  }
}