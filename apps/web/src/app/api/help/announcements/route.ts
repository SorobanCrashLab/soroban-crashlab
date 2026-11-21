// WIP scaffold for issue #2281. Release-notes feed with web/core/integrations filters
// not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ announcements: [], wip: true, issue: 2281 }, { status: 501 });
}
