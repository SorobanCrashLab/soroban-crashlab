import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return NextResponse.json({
    releaseId: id,
    gates: [
      { id: 'gate-ci', name: 'CI Unit & Integration Suite', required: true, status: 'pass' },
      { id: 'gate-sec', name: 'WASM & Dependency Security Scan', required: true, status: 'pass' },
      { id: 'gate-perf', name: 'Canary P95 Regression Budget', required: true, status: 'fail' },
    ],
  });
}
