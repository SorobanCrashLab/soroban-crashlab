// WIP scaffold for issue #2272. Retry-failed-only is not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2272 }, { status: 501 });
}
