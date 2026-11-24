// WIP scaffold for issue #2274. Get/update/delete of a single share link not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wip: true, issue: 2274 }, { status: 501 });
}
