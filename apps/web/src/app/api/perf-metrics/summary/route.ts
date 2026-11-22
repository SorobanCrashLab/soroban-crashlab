// WIP scaffold for issue #2280. Trend/percentile aggregation not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routes: [], wip: true, issue: 2280 }, { status: 501 });
}
