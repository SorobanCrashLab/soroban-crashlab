import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    whiteboards: [
      { id: 'wb-001', title: 'Token Transfer Overflow Triage', collaborators: 2 },
    ],
  });
}
