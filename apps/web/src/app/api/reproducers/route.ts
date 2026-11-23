import { NextResponse } from 'next/server';

// #2300 — GET catalog of golden reproducers/fixtures (indexed search + pagination).
export const GET = async () => NextResponse.json({ data: { fixtures: [] } });
