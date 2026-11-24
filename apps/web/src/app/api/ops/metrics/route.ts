// WIP scaffold for issue #2271. No metrics aggregation implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { serviceHealth: [], queueDepth: 0, workerThroughputPerMin: 0, wip: true, issue: 2271 },
    { status: 501 },
  );
}
