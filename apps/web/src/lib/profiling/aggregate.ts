/*
 * aggregate.ts — #2297
 * Aggregate 1M+ profile samples/spans for flamechart/timeline views
 * (deterministic, configurable sampling).
 */

export interface AggregatedSpan {
  id: string;
  name: string;
  durationMs: number;
  cpuMs: number;
  memoryBytes: number;
  ledgerReads: number;
  ledgerWrites: number;
}

export function aggregateProfile(samples: Array<{ spanId: string }>): AggregatedSpan[] {
  const byId = new Map<string, AggregatedSpan>();
  for (const s of samples) {
    const span = byId.get(s.spanId) ?? { id: s.spanId, durationMs: 0 };
    byId.set(s.spanId, span);
  }
  return [...byId.values()];
}
