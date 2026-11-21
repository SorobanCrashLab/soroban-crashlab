// WIP scaffold for issue #2273. No persistence, team/workspace scoping, or RBAC yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ views: [], wip: true, issue: 2273 }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2273 }, { status: 501 });
}
