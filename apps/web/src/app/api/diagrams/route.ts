import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    diagrams: [
      { id: 'diag-001', title: 'Soroban RPC Overflow Sequence', version: 1 },
    ],
  });
}
