/**
 * Tests for Report Generator core logic.
 * Covers: filtering, summary stats, and edge cases.
 */
import * as assert from 'node:assert/strict';
import { FuzzingRun, RunArea, RunSeverity, RunStatus } from './types';

// ── Pure helpers (mirrored from component) ────────────────────────────────────

type ReportFilters = {
    severity: RunSeverity | 'all';
    area: RunArea | 'all';
};

type ReportSummary = {
    totalRuns: number;
    totalCrashes: number;
    averageDurationMs: number;
    mostFrequentArea: string | undefined;
    mostFrequentSeverity: string | undefined;
};

function applyFilters(runs: FuzzingRun[], filters: ReportFilters): FuzzingRun[] {
    return runs.filter((run) => {
        const severityMatch = filters.severity === 'all' || run.severity === filters.severity;
        const areaMatch = filters.area === 'all' || run.area === filters.area;
        return severityMatch && areaMatch;
    });
}

function buildSummary(runs: FuzzingRun[]): ReportSummary {
    const totalRuns = runs.length;
    const totalCrashes = runs.filter((r) => r.crashDetail !== null).length;
    const totalDuration = runs.reduce((acc, r) => acc + r.duration, 0);

    const areaCounts = runs.reduce((acc, r) => {
        acc[r.area] = (acc[r.area] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const severityCounts = runs.reduce((acc, r) => {
        acc[r.severity] = (acc[r.severity] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return {
        totalRuns,
        totalCrashes,
        averageDurationMs: totalRuns > 0 ? totalDuration / totalRuns : 0,
        mostFrequentArea: Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
        mostFrequentSeverity: Object.entries(severityCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
    };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeRun = (overrides: Partial<FuzzingRun> = {}): FuzzingRun => ({
    id: `run-${Math.random().toString(16).slice(2)}`,
    status: 'completed' as RunStatus,
    area: 'auth' as RunArea,
    severity: 'low' as RunSeverity,
    duration: 1000,
    seedCount: 100,
    cpuInstructions: 500000,
    memoryBytes: 2000000,
    minResourceFee: 1000,
    crashDetail: null,
    ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. applyFilters — 'all' returns everything
{
    const runs = [makeRun({ area: 'auth' }), makeRun({ area: 'state' }), makeRun({ area: 'xdr' })];
    const result = applyFilters(runs, { severity: 'all', area: 'all' });
    assert.equal(result.length, 3);
}

// 2. applyFilters — area filter
{
    const runs = [
        makeRun({ id: 'a', area: 'auth' }),
        makeRun({ id: 'b', area: 'state' }),
        makeRun({ id: 'c', area: 'auth' }),
    ];
    const result = applyFilters(runs, { severity: 'all', area: 'auth' });
    assert.equal(result.length, 2);
    assert.ok(result.every((r) => r.area === 'auth'));
}

// 3. applyFilters — severity filter
{
    const runs = [
        makeRun({ id: 'a', severity: 'critical' }),
        makeRun({ id: 'b', severity: 'low' }),
        makeRun({ id: 'c', severity: 'critical' }),
    ];
    const result = applyFilters(runs, { severity: 'critical', area: 'all' });
    assert.equal(result.length, 2);
    assert.ok(result.every((r) => r.severity === 'critical'));
}

// 4. applyFilters — combined area + severity
{
    const runs = [
        makeRun({ id: 'match', area: 'budget', severity: 'high' }),
        makeRun({ id: 'wrong-area', area: 'auth', severity: 'high' }),
        makeRun({ id: 'wrong-sev', area: 'budget', severity: 'low' }),
    ];
    const result = applyFilters(runs, { severity: 'high', area: 'budget' });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'match');
}

// 5. applyFilters — no match returns empty
{
    const runs = [makeRun({ area: 'auth', severity: 'low' })];
    const result = applyFilters(runs, { severity: 'critical', area: 'xdr' });
    assert.equal(result.length, 0);
}

// 6. buildSummary — counts crashes correctly
{
    const runs = [
        makeRun({ crashDetail: null }),
        makeRun({ crashDetail: { failureCategory: 'Panic', signature: 'sig:1', payload: '{}', replayAction: 'cmd' } }),
        makeRun({ crashDetail: { failureCategory: 'Panic', signature: 'sig:2', payload: '{}', replayAction: 'cmd' } }),
    ];
    const summary = buildSummary(runs);
    assert.equal(summary.totalRuns, 3);
    assert.equal(summary.totalCrashes, 2);
}

// 7. buildSummary — average duration
{
    const runs = [makeRun({ duration: 1000 }), makeRun({ duration: 3000 })];
    const summary = buildSummary(runs);
    assert.equal(summary.averageDurationMs, 2000);
}

// 8. buildSummary — mostFrequentArea
{
    const runs = [
        makeRun({ area: 'auth' }),
        makeRun({ area: 'auth' }),
        makeRun({ area: 'state' }),
    ];
    const summary = buildSummary(runs);
    assert.equal(summary.mostFrequentArea, 'auth');
}

// 9. buildSummary — mostFrequentSeverity
{
    const runs = [
        makeRun({ severity: 'high' }),
        makeRun({ severity: 'critical' }),
        makeRun({ severity: 'critical' }),
    ];
    const summary = buildSummary(runs);
    assert.equal(summary.mostFrequentSeverity, 'critical');
}

// 10. Edge case: buildSummary on empty array
{
    const summary = buildSummary([]);
    assert.equal(summary.totalRuns, 0);
    assert.equal(summary.totalCrashes, 0);
    assert.equal(summary.averageDurationMs, 0);
    assert.equal(summary.mostFrequentArea, undefined);
    assert.equal(summary.mostFrequentSeverity, undefined);
}

console.log('report-generator.test.ts: all assertions passed');
