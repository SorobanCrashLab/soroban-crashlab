import { NextResponse } from 'next/server';

// #2298 — GET indexed snapshot runs (by PR/branch/commit/suite).
export const GET = async () => NextResponse.json({ data: { runs: [] } });
