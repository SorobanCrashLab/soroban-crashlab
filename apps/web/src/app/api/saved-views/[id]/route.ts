// WIP scaffold for issue #2273. Get/update/delete of a single saved view not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wip: true, issue: 2273 }, { status: 501 });
}
