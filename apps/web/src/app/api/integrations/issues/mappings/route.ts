// WIP scaffold for issue #2283. Per-workspace/campaign mapping persistence not
// implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ mappings: [], wip: true, issue: 2283 }, { status: 501 });
}
