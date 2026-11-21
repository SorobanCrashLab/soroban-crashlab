// WIP scaffold for issue #2274. No persistence, hashing, or workspace policy checks yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ links: [], wip: true, issue: 2274 }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2274 }, { status: 501 });
}
