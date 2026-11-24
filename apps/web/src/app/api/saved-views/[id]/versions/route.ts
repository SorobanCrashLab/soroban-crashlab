// WIP scaffold for issue #2273. Version history listing/restore not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ versions: [], wip: true, issue: 2273 }, { status: 501 });
}
