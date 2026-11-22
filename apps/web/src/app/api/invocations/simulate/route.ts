import { NextRequest, NextResponse } from 'next/server';
import { InvocationScenario, SAMPLE_CONTRACT, validateScenario } from '@/lib/invocations/schema';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('steps' in body) || !Array.isArray((body as InvocationScenario).steps)) return NextResponse.json({ error: 'A scenario with a steps array is required.' }, { status: 400 });
    const scenario = body as InvocationScenario;
    if (scenario.steps.length > 100) return NextResponse.json({ error: 'A scenario may contain at most 100 calls.' }, { status: 413 });
    const errors = validateScenario(scenario, [SAMPLE_CONTRACT]);
    const warnings = ['Preflight is static: network simulation, event decoding, and live resource estimation are unavailable.'];
    if (!scenario.invoker) warnings.push('No invoker address supplied; authorization requirements cannot be resolved.');
    const steps = scenario.steps.map((step, index) => {
      const fn = SAMPLE_CONTRACT.functions.find((item) => item.name === step.functionName);
      const authRequired = fn?.mutability !== 'read';
      return { step: index + 1, authRequired, resourceEstimate: Math.min(1_000_000 + Object.keys(step.args || {}).length * 25_000, scenario.budget || 10_000_000) };
    });
    return NextResponse.json({ data: { valid: errors.length === 0, errors, warnings, steps, network: scenario.network } });
  } catch {
    return NextResponse.json({ error: 'Request must contain valid JSON.' }, { status: 400 });
  }
}
