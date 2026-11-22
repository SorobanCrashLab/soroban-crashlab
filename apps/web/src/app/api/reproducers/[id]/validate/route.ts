import { NextResponse } from 'next/server';

// #2300 — POST validation replay for a reproducer/fixture ([id]).
export const POST = async () => NextResponse.json({ data: { ok: true } });
