// WIP scaffold for issue #2286. Incident creation (manual + automated from alert rules)
// and listing with filters/SLA indicators are not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ incidents: [], wip: true, issue: 2286 }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2286 }, { status: 501 });
}
