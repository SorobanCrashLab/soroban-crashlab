import { NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/openapi/spec';

export async function GET() {
  return NextResponse.json(buildOpenApiSpec());
}
