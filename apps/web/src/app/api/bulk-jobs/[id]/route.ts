// WIP scaffold for issue #2272. Progress/result polling not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wip: true, issue: 2272 }, { status: 501 });
}
