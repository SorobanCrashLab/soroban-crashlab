import { NextRequest, NextResponse } from 'next/server';
import { ContractSpec, SAMPLE_CONTRACT, isContractSpec } from '@/lib/invocations/schema';

export async function GET() {
  return NextResponse.json({ data: { specs: [SAMPLE_CONTRACT], note: 'Upload a JSON ContractSpec to use another interface. WASM spec decoding is not implemented.' } });
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const spec = body && typeof body === 'object' && 'spec' in body ? (body as { spec: unknown }).spec : body;
    if (!isContractSpec(spec)) return NextResponse.json({ error: 'Invalid contract spec. Expected contractId, name, network, and typed functions.' }, { status: 400 });
    const candidate = spec as ContractSpec;
    if (candidate.functions.length > 500 || candidate.functions.some((fn) => fn.args.length > 100)) return NextResponse.json({ error: 'Contract spec exceeds supported function or argument limits.' }, { status: 413 });
    return NextResponse.json({ data: { spec: candidate } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Request must contain valid JSON.' }, { status: 400 });
  }
}
