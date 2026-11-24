import { NextResponse } from 'next/server';

// #2299 — GET guardrail events (crash/regression/perf/ops signals).
export const GET = async () => NextResponse.json({ data: { events: [] } });
