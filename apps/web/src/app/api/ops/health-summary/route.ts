// WIP scaffold for issue #2271. Does not aggregate the existing /api/health endpoint yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ summary: [], wip: true, issue: 2271 }, { status: 501 });
}
