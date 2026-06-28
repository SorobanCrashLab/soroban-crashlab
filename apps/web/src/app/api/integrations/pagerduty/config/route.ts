/**
 * GET  /api/integrations/pagerduty/config  – load saved PagerDuty configuration
 * POST /api/integrations/pagerduty/config  – persist PagerDuty configuration
 *
 * In the absence of a persistent store this implementation uses a module-level
 * in-memory cache, matching the lightweight pattern used throughout this codebase.
 */

import { NextResponse } from 'next/server';
import type { PagerDutyConfig } from '../../../../integrate-pagerduty-alert-integration-utils';

// Module-level in-memory store (same pattern as other lightweight integrations).
let storedConfig: PagerDutyConfig | null = null;

export async function GET() {
  if (!storedConfig) {
    return NextResponse.json({ error: 'No configuration saved yet' }, { status: 404 });
  }
  return NextResponse.json(storedConfig);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PagerDutyConfig;

    if (!body || typeof body.integrationKey !== 'string') {
      return NextResponse.json({ error: 'Invalid configuration payload' }, { status: 400 });
    }

    storedConfig = body;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to parse request body' }, { status: 400 });
  }
}
