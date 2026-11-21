// WIP scaffold for issue #2284. Free-text/structured query support not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ events: [], wip: true, issue: 2284 }, { status: 501 });
}
