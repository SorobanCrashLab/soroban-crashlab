/**
 * Admin API — Quota Management
 *
 * Provides endpoints for viewing and managing tenant quotas:
 * - GET /api/admin/quotas - List all tenant quotas
 * - GET /api/admin/quotas?tenantId=... - Get specific tenant quota
 * - POST /api/admin/quotas - Set tenant tier
 * - DELETE /api/admin/quotas?tenantId=... - Reset tenant quota
 * - POST /api/admin/quotas/grace - Grant grace period
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQuotaManager } from '@/lib/security/api-gateway/QuotaManager';
import { QuotaTierSchema } from '@/lib/security/api-gateway/policies';
import { z } from 'zod';

// ─── Validation Schemas ──────────────────────────────────────────────────────

const SetTierSchema = z.object({
  tenantId: z.string().min(1),
  tier: z.string().min(1),
});

const GrantGraceSchema = z.object({
  tenantId: z.string().min(1),
  durationMs: z.number().int().positive().max(86400000), // Max 24 hours
});

const ResetQuotaSchema = z.object({
  tenantId: z.string().min(1),
});

// ─── Route Handlers ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const quotaManager = getQuotaManager();
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  try {
    if (tenantId) {
      // Get specific tenant quota
      const usage = await quotaManager.getUsage(tenantId);
      if (!usage) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Tenant ${tenantId} not found` } },
          { status: 404 }
        );
      }
      return NextResponse.json(usage);
    } else {
      // Get all tenant quotas (dashboard view)
      const dashboard = await quotaManager.getAllUsage();
      return NextResponse.json(dashboard);
    }
  } catch (error) {
    console.error('[Admin/Quotas] GET error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch quota data' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const quotaManager = getQuotaManager();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const body = await request.json();

    if (action === 'set-tier') {
      // Set tenant tier
      const { tenantId, tier } = SetTierSchema.parse(body);
      const success = await quotaManager.setTenantTier(tenantId, tier);
      if (!success) {
        return NextResponse.json(
          { error: { code: 'INVALID_TIER', message: `Invalid tier: ${tier}` } },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, tenantId, tier });
    }

    if (action === 'grace') {
      // Grant grace period
      const { tenantId, durationMs } = GrantGraceSchema.parse(body);
      await quotaManager.grantGracePeriod(tenantId, durationMs);
      return NextResponse.json({ success: true, tenantId, durationMs });
    }

    // Default: set tier (for backwards compatibility)
    const { tenantId, tier } = SetTierSchema.parse(body);
    const success = await quotaManager.setTenantTier(tenantId, tier);
    if (!success) {
      return NextResponse.json(
        { error: { code: 'INVALID_TIER', message: `Invalid tier: ${tier}` } },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, tenantId, tier });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Invalid request body', details: error.errors } },
        { status: 400 }
      );
    }
    console.error('[Admin/Quotas] POST error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update quota' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const quotaManager = getQuotaManager();
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'tenantId query parameter required' } },
      { status: 400 }
    );
  }

  try {
    await quotaManager.resetTenantQuota(tenantId);
    return NextResponse.json({ success: true, tenantId });
  } catch (error) {
    console.error('[Admin/Quotas] DELETE error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to reset quota' } },
      { status: 500 }
    );
  }
}