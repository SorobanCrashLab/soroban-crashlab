// WIP scaffold for issue #2280. No persistence/aggregation of reported metrics yet.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ wip: true, issue: 2280 }, { status: 501 });
}
