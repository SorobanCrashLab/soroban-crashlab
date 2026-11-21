// WIP scaffold for issue #2282. Linking to crash signature/cluster, runs, regressions and
// external issues is not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: [], wip: true, issue: 2282 }, { status: 501 });
}
