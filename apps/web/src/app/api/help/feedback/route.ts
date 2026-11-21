// WIP scaffold for issue #2281. Diagnostic bundle attachment and privacy-safe context
// collection not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2281 }, { status: 501 });
}
