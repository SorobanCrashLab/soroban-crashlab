import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    releases: [
      {
        id: 'rel-2026-11-21',
        version: 'v2.14.0-rc3',
        environment: 'production',
        lifecycle: 'evaluating',
        goNoGoStatus: 'NO-GO',
      },
    ],
  });
}
