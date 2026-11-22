// WIP scaffold for issue #2282 (Triage Workflow Board). Not wired to the real triage store yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { columns: [], items: [], wip: true, issue: 2282 },
    { status: 501 },
  );
}
