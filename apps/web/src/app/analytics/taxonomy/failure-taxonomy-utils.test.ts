import * as assert from 'node:assert/strict';
import {
    FAILURE_FAMILY_LABELS,
    FAILURE_TAXONOMY,
    buildCategoryBreakdown,
    classifyFailureCategory,
    filterRunsByCategories,
    getClassifiedRuns,
    groupBreakdownByFamily,
    summarizeTaxonomy,
    toggleCategory,
} from './failure-taxonomy-utils';
import type { FuzzingRun, RunArea, RunSeverity } from '../../types';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
    return {
        id: 'r0',
        status: 'completed',
        area: 'auth',
        severity: 'low',
        duration: 1000,
        seedCount: 100,
        cpuInstructions: 0,
        memoryBytes: 0,
        minResourceFee: 0,
        crashDetail: null,
        ...overrides,
    };
}

function makeFailure(
    id: string,
    category: string,
    signature: string,
    area: RunArea = 'auth',
    severity: RunSeverity = 'high',
): FuzzingRun {
    return makeRun({
        id,
        status: 'failed',
        area,
        severity,
        crashDetail: {
            failureCategory: category,
            signature,
            payload: '{}',
            replayAction: `replay ${id}`,
        },
    });
}

const runs: FuzzingRun[] = [
    makeFailure('r1', 'Panic', 'sig:a', 'state', 'critical'),
    makeFailure('r2', 'Panic', 'sig:b', 'budget', 'medium'),
    makeFailure('r3', 'Panic', 'sig:a', 'state', 'high'),
    makeFailure('r4', 'BudgetExceeded', 'sig:c', 'budget', 'medium'),
    makeFailure('r5', 'MysteryCategory', 'sig:d', 'xdr', 'low'),
    makeRun({ id: 'r6', status: 'completed' }),
    makeRun({ id: 'r7', status: 'running' }),
    // A failed run with no crash detail cannot be classified.
    makeRun({ id: 'r8', status: 'failed', crashDetail: null }),
];

// ---------------------------------------------------------------------------
// classifyFailureCategory
// ---------------------------------------------------------------------------

function testClassifyKnownCategory(): void {
    const definition = classifyFailureCategory('BudgetExceeded');
    assert.equal(definition.label, 'Budget exceeded');
    assert.equal(definition.family, 'resource');
    assert.ok(definition.triageHint.length > 0);
}

function testClassifyUnknownCategoryFallsBack(): void {
    const definition = classifyFailureCategory('SomethingNew');
    assert.equal(definition.category, 'SomethingNew');
    assert.equal(definition.label, 'SomethingNew');
    assert.equal(definition.family, 'other');
}

function testTaxonomyCategoriesAreUnique(): void {
    const categories = FAILURE_TAXONOMY.map((definition) => definition.category);
    assert.equal(new Set(categories).size, categories.length);
}

function testEveryTaxonomyEntryIsDocumented(): void {
    for (const definition of FAILURE_TAXONOMY) {
        assert.ok(definition.label.length > 0, `${definition.category} has no label`);
        assert.ok(definition.description.length > 0, `${definition.category} has no description`);
        assert.ok(definition.triageHint.length > 0, `${definition.category} has no triage hint`);
        assert.ok(FAILURE_FAMILY_LABELS[definition.family], `${definition.category} has an unknown family`);
    }
}

// ---------------------------------------------------------------------------
// getClassifiedRuns
// ---------------------------------------------------------------------------

function testGetClassifiedRunsExcludesNonFailures(): void {
    assert.deepEqual(getClassifiedRuns(runs).map((run) => run.id), ['r1', 'r2', 'r3', 'r4', 'r5']);
}

function testGetClassifiedRunsEmptyInput(): void {
    assert.deepEqual(getClassifiedRuns([]), []);
}

// ---------------------------------------------------------------------------
// buildCategoryBreakdown
// ---------------------------------------------------------------------------

function testBreakdownOrdersByCountDescending(): void {
    const breakdown = buildCategoryBreakdown(runs);
    assert.deepEqual(breakdown.map((entry) => entry.definition.category), [
        'Panic',
        'BudgetExceeded',
        'MysteryCategory',
    ]);
    assert.deepEqual(breakdown.map((entry) => entry.count), [3, 1, 1]);
}

function testBreakdownCollectsRunIdsAndSignatures(): void {
    const panic = buildCategoryBreakdown(runs)[0];
    assert.deepEqual(panic.runIds, ['r1', 'r2', 'r3']);
    // Signatures are de-duplicated: r1 and r3 share sig:a.
    assert.deepEqual(panic.signatures, ['sig:a', 'sig:b']);
}

function testBreakdownCollectsAreasAndSeverities(): void {
    const panic = buildCategoryBreakdown(runs)[0];
    assert.deepEqual(panic.areas, ['budget', 'state']);
    // Most severe first.
    assert.deepEqual(panic.severities, ['critical', 'high', 'medium']);
    assert.equal(panic.topSeverity, 'critical');
}

function testBreakdownSharesSumToOne(): void {
    const breakdown = buildCategoryBreakdown(runs);
    const total = breakdown.reduce((sum, entry) => sum + entry.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    assert.ok(Math.abs(breakdown[0].share - 3 / 5) < 1e-9);
}

function testBreakdownIncludesUnknownCategories(): void {
    const mystery = buildCategoryBreakdown(runs).find(
        (entry) => entry.definition.category === 'MysteryCategory',
    );
    assert.ok(mystery, 'unknown categories must still appear');
    assert.equal(mystery.definition.family, 'other');
}

function testBreakdownEmptyInput(): void {
    assert.deepEqual(buildCategoryBreakdown([]), []);
}

function testBreakdownWithNoFailures(): void {
    assert.deepEqual(buildCategoryBreakdown([makeRun({ id: 'x' })]), []);
}

function testBreakdownTieBreaksAlphabetically(): void {
    const tied = [makeFailure('a', 'Zeta', 'sig:1'), makeFailure('b', 'Alpha', 'sig:2')];
    assert.deepEqual(
        buildCategoryBreakdown(tied).map((entry) => entry.definition.category),
        ['Alpha', 'Zeta'],
    );
}

// ---------------------------------------------------------------------------
// toggleCategory
// ---------------------------------------------------------------------------

function testToggleCategoryAdds(): void {
    assert.deepEqual(toggleCategory([], 'Panic'), ['Panic']);
    assert.deepEqual(toggleCategory(['Panic'], 'Timeout'), ['Panic', 'Timeout']);
}

function testToggleCategoryRemoves(): void {
    assert.deepEqual(toggleCategory(['Panic', 'Timeout'], 'Panic'), ['Timeout']);
}

function testToggleCategoryDoesNotMutate(): void {
    const selected = ['Panic'];
    toggleCategory(selected, 'Timeout');
    assert.deepEqual(selected, ['Panic']);
}

// ---------------------------------------------------------------------------
// filterRunsByCategories
// ---------------------------------------------------------------------------

function testFilterWithEmptySelectionReturnsAllClassified(): void {
    assert.deepEqual(
        filterRunsByCategories(runs, []).map((run) => run.id),
        ['r1', 'r2', 'r3', 'r4', 'r5'],
    );
}

function testFilterBySingleCategory(): void {
    assert.deepEqual(
        filterRunsByCategories(runs, ['Panic']).map((run) => run.id),
        ['r1', 'r2', 'r3'],
    );
}

function testFilterByMultipleCategories(): void {
    assert.deepEqual(
        filterRunsByCategories(runs, ['BudgetExceeded', 'MysteryCategory']).map((run) => run.id),
        ['r4', 'r5'],
    );
}

function testFilterByUnmatchedCategory(): void {
    assert.deepEqual(filterRunsByCategories(runs, ['Timeout']), []);
}

function testFilterNeverReturnsUnclassifiedRuns(): void {
    for (const run of filterRunsByCategories(runs, [])) {
        assert.equal(run.status, 'failed');
        assert.ok(run.crashDetail);
    }
}

// ---------------------------------------------------------------------------
// summarizeTaxonomy / groupBreakdownByFamily
// ---------------------------------------------------------------------------

function testSummarize(): void {
    assert.deepEqual(summarizeTaxonomy(buildCategoryBreakdown(runs)), {
        classifiedFailures: 5,
        categories: 3,
        families: 3, // correctness, resource, other
        signatures: 4, // sig:a, sig:b, sig:c, sig:d
    });
}

function testSummarizeEmpty(): void {
    assert.deepEqual(summarizeTaxonomy([]), {
        classifiedFailures: 0,
        categories: 0,
        families: 0,
        signatures: 0,
    });
}

function testGroupByFamily(): void {
    const groups = groupBreakdownByFamily(buildCategoryBreakdown(runs));
    assert.deepEqual(groups.map((group) => group.family), ['correctness', 'resource', 'other']);
    assert.deepEqual(groups.map((group) => group.count), [3, 1, 1]);
    assert.equal(groups[0].label, 'Correctness');
    assert.deepEqual(groups[0].entries.map((entry) => entry.definition.category), ['Panic']);
}

function testGroupByFamilyEmpty(): void {
    assert.deepEqual(groupBreakdownByFamily([]), []);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testClassifyKnownCategory();
testClassifyUnknownCategoryFallsBack();
testTaxonomyCategoriesAreUnique();
testEveryTaxonomyEntryIsDocumented();

testGetClassifiedRunsExcludesNonFailures();
testGetClassifiedRunsEmptyInput();

testBreakdownOrdersByCountDescending();
testBreakdownCollectsRunIdsAndSignatures();
testBreakdownCollectsAreasAndSeverities();
testBreakdownSharesSumToOne();
testBreakdownIncludesUnknownCategories();
testBreakdownEmptyInput();
testBreakdownWithNoFailures();
testBreakdownTieBreaksAlphabetically();

testToggleCategoryAdds();
testToggleCategoryRemoves();
testToggleCategoryDoesNotMutate();

testFilterWithEmptySelectionReturnsAllClassified();
testFilterBySingleCategory();
testFilterByMultipleCategories();
testFilterByUnmatchedCategory();
testFilterNeverReturnsUnclassifiedRuns();

testSummarize();
testSummarizeEmpty();
testGroupByFamily();
testGroupByFamilyEmpty();

console.log('failure-taxonomy-utils.test.ts: all assertions passed');
