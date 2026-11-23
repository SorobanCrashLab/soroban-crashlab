import { NextResponse } from 'next/server';

// #2299 — GET exposure and adoption metrics per flag/experiment.
export const GET = async () => NextResponse.json({ data: { metrics: [] } });
