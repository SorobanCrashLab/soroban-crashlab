// WIP scaffold for issue #2282. SLA policy CRUD and breach/escalation events are not
// implemented yet — see features/triage/board/sla/SlaPolicyEngine.ts for the current stub logic.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ policies: [], wip: true, issue: 2282 }, { status: 501 });
}
