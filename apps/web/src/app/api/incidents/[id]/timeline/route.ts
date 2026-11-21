// WIP scaffold for issue #2286. Correlated timeline across alerts/runs/regressions/
// deployments/webhooks is not implemented yet — see
// features/incidents/correlation/correlator.ts for the current sort-only stub.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ events: [], wip: true, issue: 2286 }, { status: 501 });
}
