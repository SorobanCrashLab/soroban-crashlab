// WIP scaffold for issue #2286. Postmortem persistence/export not implemented yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wip: true, issue: 2286 }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2286 }, { status: 501 });
}
