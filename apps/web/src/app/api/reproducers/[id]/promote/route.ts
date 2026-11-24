import { NextResponse } from 'next/server';

// #2300 — POST promotion of a reproducer/fixture ([id]) to golden with rationale.
export const POST = async () => NextResponse.json({ data: { ok: true } });
