import { NextRequest, NextResponse } from 'next/server';
import { structuredLogger } from '@/lib/structured-logger';
import { redactText } from '@/lib/redaction';

const MAX_REPORT_BYTES = 16 * 1024;

interface CspViolation {
  'document-uri'?: unknown;
  'blocked-uri'?: unknown;
  'effective-directive'?: unknown;
  'violated-directive'?: unknown;
  'source-file'?: unknown;
  'line-number'?: unknown;
  'column-number'?: unknown;
  disposition?: unknown;
}

function boundedString(value: unknown, limit = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  return redactText(value).slice(0, limit);
}

function extractViolation(body: unknown): CspViolation | null {
  if (typeof body !== 'object' || body === null) return null;
  const root = body as Record<string, unknown>;
  const legacy = root['csp-report'];
  if (typeof legacy === 'object' && legacy !== null) return legacy as CspViolation;
  const first = Array.isArray(body) ? body[0] : undefined;
  if (typeof first === 'object' && first !== null) {
    const item = first as Record<string, unknown>;
    if (typeof item.body === 'object' && item.body !== null) return item.body as CspViolation;
    return item as CspViolation;
  }
  if (typeof root.body === 'object' && root.body !== null) return root.body as CspViolation;
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: 'Report too large' }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Missing CSP report body' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_REPORT_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: 'Report too large' }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return NextResponse.json({ error: 'CSP report must be UTF-8' }, { status: 400 });
  }
  if (bytes.byteLength > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: 'Report too large' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Malformed CSP report' }, { status: 400 });
  }
  const violation = extractViolation(parsed);
  if (!violation) return NextResponse.json({ error: 'Invalid CSP report' }, { status: 400 });

  await structuredLogger.warn('csp.violation', {
    effectiveDirective: boundedString(violation['effective-directive'] ?? violation['violated-directive']),
    blockedUri: boundedString(violation['blocked-uri']),
    sourceFile: boundedString(violation['source-file']),
    disposition: boundedString(violation.disposition, 32),
    lineNumber: typeof violation['line-number'] === 'number' ? violation['line-number'] : undefined,
    columnNumber: typeof violation['column-number'] === 'number' ? violation['column-number'] : undefined,
  });
  return new NextResponse(null, { status: 204 });
}
