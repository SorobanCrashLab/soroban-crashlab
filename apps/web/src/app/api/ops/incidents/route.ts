// WIP scaffold for issue #2271. Correlated-incident listing not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ incidents: [], wip: true, issue: 2271 }, { status: 501 });
}
