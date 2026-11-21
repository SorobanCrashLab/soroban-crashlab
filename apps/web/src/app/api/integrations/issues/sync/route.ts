// WIP scaffold for issue #2283. Bi-directional sync and webhook-driven updates not
// implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2283 }, { status: 501 });
}
