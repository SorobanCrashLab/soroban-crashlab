import { computeClusterStats, getHealthColor } from './add-run-cluster-overview';
import { FuzzingRun } from './types';

// Helper to build a minimal FuzzingRun
function makeRun(overrides: Partial<FuzzingRun>): FuzzingRun {
  return {
    id: 'test-id',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1024,
    minResourceFee: 0,
    ...overrides,
  };
}

describe('computeClusterStats', () => {
  describe('empty array', () => {
    it('returns all four areas', () => {
      const result = computeClusterStats([]);
      const areas = result.map((s) => s.area);
      expect(areas).toEqual(['auth', 'state', 'budget', 'xdr']);
    });

    it('sets healthScore = 100 for all areas', () => {
      const result = computeClusterStats([]);
      result.forEach((s) => expect(s.healthScore).toBe(100));
    });

    it('sets avgCpu = 0 for all areas', () => {
      const result = computeClusterStats([]);
      result.forEach((s) => expect(s.avgCpu).toBe(0));
    });

    it('sets criticalIssues = 0 for all areas', () => {
      const result = computeClusterStats([]);
      result.forEach((s) => expect(s.criticalIssues).toBe(0));
    });

    it('sets total = 0 for all areas', () => {
      const result = computeClusterStats([]);
      result.forEach((s) => expect(s.total).toBe(0));
    });
  });

  describe('all runs failed', () => {
    it('sets healthScore = 0 for auth when all auth runs are failed', () => {
      const runs = [
        makeRun({ area: 'auth', status: 'failed' }),
        makeRun({ area: 'auth', status: 'failed' }),
        makeRun({ area: 'auth', status: 'failed' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.healthScore).toBe(0);
    });

    it('does not affect other areas when only auth runs are failed', () => {
      const runs = [makeRun({ area: 'auth', status: 'failed' })];
      const result = computeClusterStats(runs);
      const state = result.find((s) => s.area === 'state')!;
      expect(state.healthScore).toBe(100);
    });
  });

  describe('all runs completed', () => {
    it('sets healthScore = 100 for auth when all auth runs are completed', () => {
      const runs = [
        makeRun({ area: 'auth', status: 'completed' }),
        makeRun({ area: 'auth', status: 'completed' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.healthScore).toBe(100);
    });
  });

  describe('mixed runs — healthScore formula', () => {
    it('computes healthScore correctly for mixed statuses', () => {
      // 2 completed, 2 running, 1 failed → total=5
      // healthScore = round(((2 + 2*0.5) / 5) * 100) = round((3/5)*100) = round(60) = 60
      const runs = [
        makeRun({ area: 'auth', status: 'completed' }),
        makeRun({ area: 'auth', status: 'completed' }),
        makeRun({ area: 'auth', status: 'running' }),
        makeRun({ area: 'auth', status: 'running' }),
        makeRun({ area: 'auth', status: 'failed' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.healthScore).toBe(60);
    });

    it('computes healthScore correctly with cancelled runs (not counted in formula)', () => {
      // 1 completed, 0 running, 0 failed, 1 cancelled → total=2
      // healthScore = round(((1 + 0*0.5) / 2) * 100) = round(50) = 50
      const runs = [
        makeRun({ area: 'auth', status: 'completed' }),
        makeRun({ area: 'auth', status: 'cancelled' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.healthScore).toBe(50);
    });
  });

  describe('criticalIssues', () => {
    it('counts only runs with severity = critical', () => {
      const runs = [
        makeRun({ area: 'auth', severity: 'critical' }),
        makeRun({ area: 'auth', severity: 'critical' }),
        makeRun({ area: 'auth', severity: 'high' }),
        makeRun({ area: 'auth', severity: 'medium' }),
        makeRun({ area: 'auth', severity: 'low' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.criticalIssues).toBe(2);
    });

    it('returns 0 criticalIssues when no runs have critical severity', () => {
      const runs = [
        makeRun({ area: 'auth', severity: 'high' }),
        makeRun({ area: 'auth', severity: 'low' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.criticalIssues).toBe(0);
    });

    it('does not count critical runs from other areas', () => {
      const runs = [
        makeRun({ area: 'state', severity: 'critical' }),
        makeRun({ area: 'auth', severity: 'low' }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.criticalIssues).toBe(0);
    });
  });

  describe('avgCpu', () => {
    it('returns arithmetic mean of cpuInstructions', () => {
      const runs = [
        makeRun({ area: 'auth', cpuInstructions: 100 }),
        makeRun({ area: 'auth', cpuInstructions: 200 }),
        makeRun({ area: 'auth', cpuInstructions: 300 }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      // mean = (100+200+300)/3 = 200
      expect(auth.avgCpu).toBe(200);
    });

    it('returns 0 when no runs exist for the area', () => {
      const runs = [makeRun({ area: 'state', cpuInstructions: 500 })];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.avgCpu).toBe(0);
    });

    it('does not include cpuInstructions from other areas', () => {
      const runs = [
        makeRun({ area: 'auth', cpuInstructions: 100 }),
        makeRun({ area: 'state', cpuInstructions: 9999 }),
      ];
      const result = computeClusterStats(runs);
      const auth = result.find((s) => s.area === 'auth')!;
      expect(auth.avgCpu).toBe(100);
    });
  });
});

// Property-based tests
import fc from 'fast-check';

// Arbitraries for FuzzingRun fields
const runStatusArb = fc.constantFrom<FuzzingRun['status']>('running', 'completed', 'failed', 'cancelled');
const runAreaArb = fc.constantFrom<FuzzingRun['area']>('auth', 'state', 'budget', 'xdr');
const runSeverityArb = fc.constantFrom<FuzzingRun['severity']>('low', 'medium', 'high', 'critical');

const fuzzingRunArb: fc.Arbitrary<FuzzingRun> = fc.record({
  id: fc.string(),
  status: runStatusArb,
  area: runAreaArb,
  severity: runSeverityArb,
  duration: fc.nat(),
  seedCount: fc.nat(),
  crashDetail: fc.constant(null),
  cpuInstructions: fc.nat(),
  memoryBytes: fc.nat(),
  minResourceFee: fc.nat(),
});

/**
 * Feature: run-cluster-overview, Property 1: HealthScore is always in [0, 100]
 * Validates: Requirements 2.2
 */
describe('Property 1: HealthScore is always in [0, 100]', () => {
  it('healthScore is always >= 0 and <= 100 for all areas across random FuzzingRun arrays', () => {
    fc.assert(
      fc.property(fc.array(fuzzingRunArb), (runs) => {
        const stats = computeClusterStats(runs);
        return stats.every((s) => s.healthScore >= 0 && s.healthScore <= 100);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 2: HealthScore is 100 when total is zero
 * Validates: Requirements 2.2, 2.5
 */
describe('Property 2: HealthScore is 100 when total is zero', () => {
  it('healthScore is 100 for an area when no runs belong to that area', () => {
    fc.assert(
      fc.property(
        runAreaArb,
        fc.array(fuzzingRunArb, { maxLength: 20 }),
        (chosenArea, allRuns) => {
          // Filter out any runs that happen to match the chosen area
          const runsWithoutChosenArea = allRuns.filter((r) => r.area !== chosenArea);
          const stats = computeClusterStats(runsWithoutChosenArea);
          const areaStats = stats.find((s) => s.area === chosenArea)!;
          return areaStats.healthScore === 100;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 3: Progress bar segments sum to ≤ 100%
 * Validates: Requirements 4.1, 4.2, 4.3
 */
describe('Property 3: Progress bar segments sum to ≤ 100%', () => {
  it('completedPct + runningPct + failedPct is always <= 100 for all areas across random FuzzingRun arrays', () => {
    fc.assert(
      fc.property(fc.array(fuzzingRunArb), (runs) => {
        const stats = computeClusterStats(runs);
        return stats.every((s) => {
          const completedPct = s.total > 0 ? (s.completed / s.total) * 100 : 0;
          const runningPct = s.total > 0 ? (s.running / s.total) * 100 : 0;
          const failedPct = s.total > 0 ? (s.failed / s.total) * 100 : 0;
          return completedPct + runningPct + failedPct <= 100;
        });
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 4: avgCpu is 0 when no runs exist for an area
 * Validates: Requirements 2.3, 2.5
 */
describe('Property 4: avgCpu is 0 when no runs exist for an area', () => {
  it('avgCpu is 0 for an area when no runs belong to that area', () => {
    fc.assert(
      fc.property(
        runAreaArb,
        fc.array(fuzzingRunArb, { maxLength: 20 }),
        (chosenArea, allRuns) => {
          // Filter out any runs that happen to match the chosen area
          const runsWithoutChosenArea = allRuns.filter((r) => r.area !== chosenArea);
          const stats = computeClusterStats(runsWithoutChosenArea);
          const areaStats = stats.find((s) => s.area === chosenArea)!;
          return areaStats.avgCpu === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 5: criticalIssues count matches filtered run count
 * Validates: Requirements 2.4
 */
describe('Property 5: criticalIssues count matches filtered run count', () => {
  it('criticalIssues equals the count of runs with matching area and severity critical', () => {
    fc.assert(
      fc.property(fc.array(fuzzingRunArb), (runs) => {
        const stats = computeClusterStats(runs);
        return stats.every(
          (s) =>
            s.criticalIssues ===
            runs.filter((r) => r.area === s.area && r.severity === 'critical').length
        );
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 6: All four areas are always represented
 * Validates: Requirements 1.2, 2.5
 */
describe('Property 6: All four areas are always represented', () => {
  it('computeClusterStats always returns exactly 4 entries covering all four RunArea values', () => {
    const allAreas: FuzzingRun['area'][] = ['auth', 'state', 'budget', 'xdr'];
    fc.assert(
      fc.property(fc.array(fuzzingRunArb), (runs) => {
        const stats = computeClusterStats(runs);
        if (stats.length !== 4) return false;
        return allAreas.every((area) => stats.some((s) => s.area === area));
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: run-cluster-overview, Property 7: Health color thresholds are mutually exclusive and exhaustive
 * Validates: Requirements 3.1, 3.2, 3.3
 */
describe('Property 7: Health color thresholds are mutually exclusive and exhaustive', () => {
  it('exactly one of emerald, amber, rose color keys appears in the returned class for any score in [0, 100]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        const colorClass = getHealthColor(score);
        const hasEmerald = colorClass.includes('emerald');
        const hasAmber = colorClass.includes('amber');
        const hasRose = colorClass.includes('rose');
        const count = [hasEmerald, hasAmber, hasRose].filter(Boolean).length;
        return count === 1;
      }),
      { numRuns: 200 }
    );
  });
});
