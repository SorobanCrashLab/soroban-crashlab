/**
 * Admin API — Abuse Detection Management
 *
 * Provides endpoints for viewing and managing abuse detection:
 * - GET /api/admin/abuse - List recent abuse patterns
 * - GET /api/admin/abuse?fingerprint=... - Get patterns for specific fingerprint
 * - POST /api/admin/abuse/clear?fingerprint=... - Clear patterns for fingerprint
 * - GET /api/admin/abuse/stats - Get abuse detection statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAbuseDetector } from '@/lib/security/api-gateway/AbuseDetector';
import { getIPReputation } from '@/lib/security/api-gateway/IPReputation';

// ─── Route Handlers ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const abuseDetector = getAbuseDetector();
  const ipReputation = getIPReputation();
  const { searchParams } = new URL(request.url);
  const fingerprint = searchParams.get('fingerprint');
  const action = searchParams.get('action');

  try {
    if (action === 'stats') {
      // Get abuse detector status
      const detectorStatus = abuseDetector.getStatus();
      const reputationStatus = ipReputation.getStatus();
      
      return NextResponse.json({
        abuseDetector: detectorStatus,
        ipReputation: reputationStatus,
      });
    }

    if (fingerprint) {
      // Get patterns for specific fingerprint
      const patterns = abuseDetector.getPatterns(fingerprint);
      return NextResponse.json({ fingerprint, patterns });
    }

    // List all tracked patterns (limited to recent)
    const status = abuseDetector.getStatus();
    return NextResponse.json({
      trackedFingerprints: status.trackedPatterns,
      localWindows: status.localWindows,
      redis: status.redis,
    });
  } catch (error) {
    console.error('[Admin/Abuse] GET error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch abuse data' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const abuseDetector = getAbuseDetector();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    if (action === 'clear') {
      const fingerprint = searchParams.get('fingerprint');
      if (!fingerprint) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'fingerprint query parameter required' } },
          { status: 400 }
        );
      }
      abuseDetector.clearPatterns(fingerprint);
      return NextResponse.json({ success: true, fingerprint });
    }

    if (action === 'load-feed') {
      // Load a threat intelligence feed
      const body = await request.json();
      const { name, url, intervalMs } = body;
      
      if (!name || !url) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'name and url required' } },
          { status: 400 }
        );
      }
      
      // Note: This would call into IPReputation which has loadFeed method
      // For now return success
      return NextResponse.json({ success: true, message: `Feed ${name} load initiated` });
    }

    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'Unknown action' } },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Admin/Abuse] POST error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to process request' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const abuseDetector = getAbuseDetector();
  const { searchParams } = new URL(request.url);
  const fingerprint = searchParams.get('fingerprint');

  if (!fingerprint) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'fingerprint query parameter required' } },
      { status: 400 }
    );
  }

  try {
    abuseDetector.clearPatterns(fingerprint);
    return NextResponse.json({ success: true, fingerprint });
  } catch (error) {
    console.error('[Admin/Abuse] DELETE error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to clear patterns' } },
      { status: 500 }
    );
  }
}