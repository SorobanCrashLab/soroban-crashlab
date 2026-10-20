import { NextResponse } from 'next/server';
import { serializeOpenApiSpec } from '@/lib/openapi/spec';

export async function GET() {
  // Served as pre-serialized bytes so the response is byte-identical to the
  // committed openapi.json the CI gate diffs (#1831).
  return new NextResponse(serializeOpenApiSpec(), {
    headers: { 'content-type': 'application/json' },
  });
}
