import { InvocationScenario } from './schema';
import { serializeScenario } from './serialize';

export function exportScenario(scenario: InvocationScenario, format: 'json' | 'fixture' | 'api'): string {
  const json = serializeScenario(scenario);
  if (format === 'fixture') return `// Soroban CrashLab scenario fixture\nexport const scenario = ${JSON.stringify(JSON.parse(json), null, 2)} as const;\n`;
  if (format === 'api') return JSON.stringify({ endpoint: '/api/invocations/simulate', method: 'POST', body: JSON.parse(json) }, null, 2);
  return JSON.stringify(JSON.parse(json), null, 2);
}
