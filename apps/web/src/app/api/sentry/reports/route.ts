import { NextRequest } from 'next/server';
import { buildMockCrashReports } from '@/lib/integrations/sentry-store';
import { withFixtureCaching } from '@/lib/fixture-caching';

/**
 * GET /api/sentry/reports
 * Returns recent crash reports that have been (or are pending being) sent to Sentry.
 */
export async function GET(request: NextRequest) {
  const data = { reports: buildMockCrashReports() };
  return withFixtureCaching(request, { data });
}
