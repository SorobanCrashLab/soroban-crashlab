// WIP scaffold for issue #2275. Usage analytics (request volume, error rate, rate-limit
// hits) are not tracked anywhere yet — this is the only genuinely new route for this issue;
// create/list/rotate/revoke already exist under /api/settings/tokens.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { requestCount: 0, errorCount: 0, rateLimitHits: 0, lastUsedAt: null, wip: true, issue: 2275 },
    { status: 501 },
  );
}
