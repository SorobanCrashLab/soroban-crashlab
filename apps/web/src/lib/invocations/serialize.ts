import { InvocationScenario } from './schema';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Stable JSON for review, sharing, and fixture generation (not XDR encoding). */
export function serializeScenario(scenario: InvocationScenario): string {
  return canonical(scenario);
}
