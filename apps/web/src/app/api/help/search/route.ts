// WIP scaffold for issue #2281. Not backed by scripts/docs/build-help-index.mjs yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ articles: [], wip: true, issue: 2281 }, { status: 501 });
}
