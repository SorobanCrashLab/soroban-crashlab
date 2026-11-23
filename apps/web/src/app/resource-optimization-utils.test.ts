import { describe, expect, it } from 'vitest';
import {
  analyzeResourceOptimization,
  recommendationToDiagnostics,
  recordRecommendationFeedback,
} from './resource-optimization-utils';

describe('resource optimization recommendations', () => {
  it('produces actionable bounded recommendations', () => {
    const recommendations = analyzeResourceOptimization({ contract: 'risk', method: 'run', gasUsed: 1_000_000, storageWrites: 30, loopIterations: 64, source: 'Vec' });
    expect(recommendations.length).toBeGreaterThanOrEqual(3);
    expect(recommendations.every((item) => item.estimatedGasReductionPct > 0)).toBe(true);
  });

  it('creates IDE diagnostics and tracks feedback', () => {
    const [recommendation] = analyzeResourceOptimization({ gasUsed: 1000, storageWrites: 100 });
    const diagnostic = recommendationToDiagnostics(recommendation);
    expect(diagnostic.message).toContain('Estimated gas reduction');
    expect(recordRecommendationFeedback([], recommendation.id, 'accepted')).toEqual([{ id: recommendation.id, status: 'accepted' }]);
  });
});
