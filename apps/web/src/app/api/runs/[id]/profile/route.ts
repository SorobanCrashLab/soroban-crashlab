import { NextResponse } from 'next/server';

// #2297 — GET normalized profiling metrics for a run (schema-versioned).
export const GET = async () => NextResponse.json({ data: { metrics: [] } });
