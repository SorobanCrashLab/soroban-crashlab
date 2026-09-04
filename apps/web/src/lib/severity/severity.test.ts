/**
 * Tests for composite severity scoring.
 * Factor fns individually table-tested incl. degenerate inputs.
 * Monotonicity sanity tests.
 */

import {
    computeRawFactors,
    computeSeverityScore,
    batchScoreClusters,
    testMonotonicity,
    compareSeverity,
    normalizeFrequency,
    normalizeBlastRadius,
    normalizeNovelty,
    normalizeResourceImpact,
    SEVERITY_WEIGHTS,
} from './index';

import { RunCluster } from './index';

const createBaseCluster = (overrides: Partial<RunCluster> = {}): RunCluster => ({
    id: 'test-cluster',
    signature: 'sig-123',
    failureCategory: 'OOB',
    area: 'state',
    severity: 'medium',
    count: 10,
    representativeRunId: 'run-1',
    relatedRunIds: ['run-1', 'run-2', 'run-3'],
    firstSeen: '2024-01-15T00:00:00Z',
    lastSeen: '2024-01-20T00:00:00Z',
    minResourceFee: 500,
    maxResourceFee: 2000,
    avgResourceFee: 1500,
    cpuInstructions: 1_500_000,
    memoryBytes: 2_000_000,
    ...overrides,
});

describe('normalizeFrequency', () => {
    it('returns 0 for count <= 1', () => {
        expect(normalizeFrequency(0)).toBe(0);
        expect(normalizeFrequency(1)).toBe(0);
    });

    it('scales logarithmically', () => {
        expect(normalizeFrequency(10)).toBeCloseTo(Math.log10(10) / 3);
        expect(normalizeFrequency(100)).toBeCloseTo(Math.log10(100) / 3);
        expect(normalizeFrequency(1000)).toBeCloseTo(1);
    });

    it('caps at 1', () => {
        expect(normalizeFrequency(10000)).toBe(1);
    });
});

describe('normalizeBlastRadius', () => {
    it('returns 0 for empty areas', () => {
        expect(normalizeBlastRadius([])).toBe(0);
    });

    it('scales with unique areas', () => {
        expect(normalizeBlastRadius(['auth'])).toBeCloseTo(0.25);
        expect(normalizeBlastRadius(['auth', 'state'])).toBeCloseTo(0.5);
        expect(normalizeBlastRadius(['auth', 'state', 'budget'])).toBeCloseTo(0.75);
        expect(normalizeBlastRadius(['auth', 'state', 'budget', 'xdr'])).toBe(1);
    });

    it('deduplicates areas', () => {
        expect(normalizeBlastRadius(['auth', 'auth', 'state'])).toBeCloseTo(0.5);
    });

    it('caps at 1', () => {
        expect(normalizeBlastRadius(['a', 'b', 'c', 'd', 'e'])).toBe(1);
    });
});

describe('normalizeNovelty', () => {
    it('returns 1 for future dates (age <= 0)', () => {
        const future = new Date(Date.now() + 86400000).toISOString();
        expect(normalizeNovelty(future)).toBe(1);
    });

    it('returns 0 for dates older than 30 days', () => {
        const old = new Date(Date.now() - 31 * 86400000).toISOString();
        expect(normalizeNovelty(old)).toBe(0);
    });

    it('scales linearly between 0 and 30 days', () => {
        const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
        expect(normalizeNovelty(fifteenDaysAgo)).toBeCloseTo(0.5);
    });
});

describe('normalizeResourceImpact', () => {
    it('returns 0 for baseline values', () => {
        expect(normalizeResourceImpact(1000, 1000, 1000000, 1000000, 1048576, 1048576)).toBe(0);
    });

    it('scales with fee ratio', () => {
        expect(normalizeResourceImpact(5000, 1000)).toBeCloseTo(0.5); // 5x baseline
        expect(normalizeResourceImpact(10000, 1000)).toBe(1); // 10x baseline (capped)
    });

    it('takes max of fee/cpu/mem ratios', () => {
        // High CPU but normal fee
        const result = normalizeResourceImpact(1000, 1000, 5000000, 1000000);
        expect(result).toBeCloseTo(0.5); // 5x CPU
    });

    it('caps at 1 (10x baseline)', () => {
        expect(normalizeResourceImpact(100000, 1000)).toBe(1);
    });
});

describe('computeRawFactors', () => {
    it('computes all four factors', () => {
        const cluster = createBaseCluster({
            count: 100,
            area: 'state',
            firstSeen: '2024-12-01T00:00:00Z', // recent
            avgResourceFee: 5000,
        });

        const allClusters = [
            cluster,
            { ...cluster, id: 'c2', area: 'auth' },
            { ...cluster, id: 'c3', area: 'budget' },
        ];

        const factors = computeRawFactors(cluster, allClusters);
        
        expect(factors.frequency).toBeGreaterThan(0);
        expect(factors.blastRadius).toBeGreaterThan(0);
        expect(factors.novelty).toBeGreaterThan(0);
        expect(factors.resourceImpact).toBeGreaterThan(0);
    });

    it('handles missing allClusters', () => {
        const cluster = createBaseCluster();
        const factors = computeRawFactors(cluster, []);
        
        expect(factors.blastRadius).toBeCloseTo(0.25); // only own area
    });
});

describe('computeSeverityScore', () => {
    it('produces score in 0-100 range', () => {
        const cluster = createBaseCluster();
        const result = computeSeverityScore(cluster, [cluster]);
        
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('includes factor breakdown', () => {
        const cluster = createBaseCluster();
        const result = computeSeverityScore(cluster, [cluster]);
        
        expect(result.factors).toHaveLength(4);
        result.factors.forEach(f => {
            expect(f).toHaveProperty('key');
            expect(f).toHaveProperty('value');
            expect(f).toHaveProperty('weighted');
        });
    });

    it('suggests severity based on score thresholds', () => {
        const lowCluster = createBaseCluster({ count: 1, avgResourceFee: 1000 });
        const lowResult = computeSeverityScore(lowCluster, [lowCluster]);
        expect(lowResult.suggestedSeverity).toBe('low');

        const highCluster = createBaseCluster({ count: 1000, avgResourceFee: 50000 });
        const highResult = computeSeverityScore(highCluster, [highCluster]);
        expect(highResult.suggestedSeverity).toBe('critical');
    });

    it('includes cluster reference', () => {
        const cluster = createBaseCluster();
        const result = computeSeverityScore(cluster, [cluster]);
        expect(result.cluster).toBe(cluster);
    });
});

describe('batchScoreClusters', () => {
    it('scores multiple clusters', () => {
        const clusters = [
            createBaseCluster({ id: 'c1', count: 10 }),
            createBaseCluster({ id: 'c2', count: 20 }),
            createBaseCluster({ id: 'c3', count: 30 }),
        ];

        const results = batchScoreClusters(clusters, clusters);
        
        expect(results).toHaveLength(3);
        expect(results[0].cluster.id).toBe('c1');
        expect(results[1].cluster.id).toBe('c2');
        expect(results[2].cluster.id).toBe('c3');
    });

    it('uses memoization for performance', () => {
        const clusters = Array.from({ length: 100 }, (_, i) => 
            createBaseCluster({ id: `c${i}`, count: i + 1 })
        );

        const start = performance.now();
        batchScoreClusters(clusters, clusters);
        const elapsed = performance.now() - start;
        
        // Should be well under 200ms for 5k runs (100 runs here)
        expect(elapsed).toBeLessThan(50);
    });
});

describe('compareSeverity', () => {
    it('detects no mismatch when equal', () => {
        const result = compareSeverity('medium', 'medium');
        expect(result.hasMismatch).toBe(false);
        expect(result.delta).toBe(0);
    });

    it('detects manual < suggested', () => {
        const result = compareSeverity('low', 'high');
        expect(result.hasMismatch).toBe(true);
        expect(result.delta).toBe(2);
    });

    it('detects manual > suggested', () => {
        const result = compareSeverity('critical', 'medium');
        expect(result.hasMismatch).toBe(true);
        expect(result.delta).toBe(-1);
    });

    it('returns correct manual and suggested', () => {
        const result = compareSeverity('medium', 'high');
        expect(result.manual).toBe('medium');
        expect(result.suggested).toBe('high');
    });
});

describe('testMonotonicity', () => {
    it('passes all monotonicity checks', () => {
        const result = testMonotonicity();
        expect(result.passed).toBe(true);
        expect(result.violations).toHaveLength(0);
    });
});

describe('edge cases', () => {
    it('handles empty relatedRunIds', () => {
        const cluster = createBaseCluster({ relatedRunIds: [] });
        const result = computeSeverityScore(cluster, [cluster]);
        expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('handles extreme fee values', () => {
        const cluster = createBaseCluster({ avgResourceFee: 1_000_000 });
        const result = computeSeverityScore(cluster, [cluster]);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles zero resource fee', () => {
        const cluster = createBaseCluster({ avgResourceFee: 0 });
        const result = computeSeverityScore(cluster, [cluster]);
        expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('handles ancient firstSeen', () => {
        const cluster = createBaseCluster({ firstSeen: '2020-01-01T00:00:00Z' });
        const result = computeSeverityScore(cluster, [cluster]);
        expect(result.factors.find(f => f.key === 'novelty')?.value).toBe(0);
    });

    it('weights sum to 1.0', () => {
        const sum = Object.values(SEVERITY_WEIGHTS).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0);
    });
});

describe('performance benchmark', () => {
    it('scores 5000 clusters under 200ms', () => {
        const clusters = Array.from({ length: 5000 }, (_, i) => 
            createBaseCluster({ 
                id: `cluster-${i}`, 
                count: (i % 100) + 1,
                avgResourceFee: 1000 + (i * 10),
                firstSeen: new Date(Date.now() - (i % 30) * 86400000).toISOString(),
            })
        );

        const start = performance.now();
        batchScoreClusters(clusters, clusters);
        const elapsed = performance.now() - start;
        
        console.log(`Scored 5000 clusters in ${elapsed.toFixed(2)}ms`);
        expect(elapsed).toBeLessThan(200);
    });
});