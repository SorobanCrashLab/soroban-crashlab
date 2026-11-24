import { NextResponse } from 'next/server';

// #2298 — GET/POST snapshot reviews and annotations.
export const GET = async () => NextResponse.json({ data: { reviews: [] } });

export const POST = async () => NextResponse.json({ data: { ok: true } });
