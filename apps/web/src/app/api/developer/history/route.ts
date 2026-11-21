// WIP scaffold for issue #2285. Request history persistence with redaction is not
// implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ entries: [], wip: true, issue: 2285 }, { status: 501 });
}
