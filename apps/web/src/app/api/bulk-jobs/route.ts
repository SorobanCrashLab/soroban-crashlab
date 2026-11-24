// WIP scaffold for issue #2272. No background job runner exists yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2272 }, { status: 501 });
}
