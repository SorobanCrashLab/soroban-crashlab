// WIP scaffold for issue #2286. Incident detail/status transitions not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wip: true, issue: 2286 }, { status: 501 });
}
