// WIP scaffold for issue #2284. Cross-entity correlation (run -> triage -> issue sync ->
// webhook delivery) is not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ correlations: [], wip: true, issue: 2284 }, { status: 501 });
}
