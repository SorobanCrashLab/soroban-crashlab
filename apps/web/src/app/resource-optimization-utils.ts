export type OptimizationCategory = 'storage' | 'loop' | 'encoding' | 'fee' | 'transient';
export type RecommendationStatus = 'pending' | 'accepted' | 'rejected';

export interface OptimizationRecommendation {
  id: string;
  category: OptimizationCategory;
  title: string;
  description: string;
  file?: string;
  line?: number;
  estimatedGasReductionPct: number;
  estimatedUsdSavings: number;
  confidence: number;
  status: RecommendationStatus;
}

export interface OptimizationTrace {
  contract?: string;
  method?: string;
  gasUsed?: number;
  cpuInstructions?: number;
  memoryBytes?: number;
  storageWrites?: number;
  loopIterations?: number;
  source?: string;
}

export function analyzeResourceOptimization(trace: OptimizationTrace, stroopsPerUsd = 100_000_000): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const gas = Math.max(0, trace.gasUsed ?? trace.cpuInstructions ?? 0);
  const add = (recommendation: Omit<OptimizationRecommendation, 'id' | 'status'>) => {
    const id = `${trace.contract ?? 'contract'}:${trace.method ?? 'method'}:${recommendation.category}`;
    recommendations.push({ ...recommendation, id, status: 'pending' });
  };

  if ((trace.storageWrites ?? 0) > 20) {
    const reduction = 35;
    add({ category: 'transient', title: 'Replace repeated storage with transient state', description: 'Batch transient values or use contract storage only for durable state.', estimatedGasReductionPct: reduction, estimatedUsdSavings: gas * reduction / 100 / stroopsPerUsd, confidence: 0.82 });
  }
  if ((trace.loopIterations ?? 0) > 32) {
    const reduction = 22;
    add({ category: 'loop', title: 'Bound or unroll hot loop', description: 'Unroll fixed iterations or add an explicit bounded iteration limit.', estimatedGasReductionPct: reduction, estimatedUsdSavings: gas * reduction / 100 / stroopsPerUsd, confidence: 0.76 });
  }
  if ((trace.source ?? '').includes('Vec') || (trace.source ?? '').includes('Map')) {
    const reduction = 14;
    add({ category: 'encoding', title: 'Use a compact bitset or packed encoding', description: 'Replace sparse collection and boolean fields with a compact representation.', estimatedGasReductionPct: reduction, estimatedUsdSavings: gas * reduction / 100 / stroopsPerUsd, confidence: 0.68 });
  }
  if ((trace.memoryBytes ?? 0) > 64 * 1024) {
    const reduction = 18;
    add({ category: 'fee', title: 'Reduce peak memory allocation', description: 'Reuse buffers and avoid large temporary vectors on the execution path.', estimatedGasReductionPct: reduction, estimatedUsdSavings: gas * reduction / 100 / stroopsPerUsd, confidence: 0.72 });
  }
  return recommendations.sort((a, b) => b.estimatedGasReductionPct - a.estimatedGasReductionPct);
}

export function projectOptimizationSavings(recommendations: OptimizationRecommendation[], usdPerUnit = 1 / 100_000_000): number {
  return recommendations.reduce((total, recommendation) => total + recommendation.estimatedUsdSavings * usdPerUnit, 0);
}

export function recordRecommendationFeedback(
  history: Array<{ id: string; status: RecommendationStatus }>,
  id: string,
  status: 'accepted' | 'rejected',
): Array<{ id: string; status: RecommendationStatus }> {
  const existing = history.filter((entry) => entry.id !== id);
  return [...existing, { id, status }];
}

export function recommendationToDiagnostics(recommendation: OptimizationRecommendation) {
  return {
    severity: 'warning',
    source: 'soroban-resource-optimizer',
    message: `${recommendation.title}. Estimated gas reduction: ${recommendation.estimatedGasReductionPct.toFixed(1)}%.`,
    file: recommendation.file,
    line: recommendation.line,
  };
}
