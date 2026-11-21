// WIP scaffold for issue #2285. Saved request collection CRUD is not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ collections: [], wip: true, issue: 2285 }, { status: 501 });
}
