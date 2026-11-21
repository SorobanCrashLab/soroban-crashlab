// WIP scaffold for issue #2274. Token rotation not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2274 }, { status: 501 });
}
