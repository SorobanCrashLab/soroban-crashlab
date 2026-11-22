import * as assert from 'node:assert/strict';
import {
    STATE_CHANGE_FILTERS,
    compareLedgerValues,
    countFieldChanges,
    countForFilter,
    filterStateChanges,
    formatLedgerValue,
    summarizeStateChanges,
} from './state-diff-utils';
import type { LedgerStateChange } from '../types';

const changes: LedgerStateChange[] = [
    { id: 'e1', entryType: 'ContractData', changeType: 'created', after: '{"key":"a"}' },
    { id: 'e2', entryType: 'Account', changeType: 'updated', before: '{"balance":"10"}', after: '{"balance":"9"}' },
    { id: 'e3', entryType: 'TrustLine', changeType: 'deleted', before: '{"asset":"USDC"}' },
    { id: 'e4', entryType: 'ContractData', changeType: 'updated', before: '{"n":1}', after: '{"n":2}' },
];

// ---------------------------------------------------------------------------
// compareLedgerValues
// ---------------------------------------------------------------------------

function testCompareClassifiesEveryKey(): void {
    const diff = compareLedgerValues(
        '{"kept":"same","gone":"x","moved":1}',
        '{"kept":"same","moved":2,"fresh":true}',
    );
    assert.deepEqual(diff.added, { fresh: true });
    assert.deepEqual(diff.removed, { gone: 'x' });
    assert.deepEqual(diff.changed, { moved: { before: 1, after: 2 } });
    assert.deepEqual(diff.unchanged, { kept: 'same' });
    assert.equal(diff.parseFailed, false);
}

function testCompareTreatsMissingBeforeAsCreation(): void {
    const diff = compareLedgerValues(undefined, '{"a":1,"b":2}');
    assert.deepEqual(diff.added, { a: 1, b: 2 });
    assert.deepEqual(diff.removed, {});
    assert.equal(diff.parseFailed, false);
}

function testCompareTreatsMissingAfterAsDeletion(): void {
    const diff = compareLedgerValues('{"a":1}', undefined);
    assert.deepEqual(diff.removed, { a: 1 });
    assert.deepEqual(diff.added, {});
}

function testCompareBothMissing(): void {
    const diff = compareLedgerValues(undefined, undefined);
    assert.equal(countFieldChanges(diff), 0);
    assert.equal(diff.parseFailed, false);
}

function testCompareComparesNestedValuesStructurally(): void {
    const diff = compareLedgerValues('{"n":{"x":1}}', '{"n":{"x":1}}');
    assert.deepEqual(diff.unchanged, { n: { x: 1 } });
    assert.equal(countFieldChanges(diff), 0);
}

function testCompareDetectsNestedDifference(): void {
    const diff = compareLedgerValues('{"n":{"x":1}}', '{"n":{"x":2}}');
    assert.deepEqual(diff.changed, { n: { before: { x: 1 }, after: { x: 2 } } });
}

function testCompareFlagsMalformedJson(): void {
    const diff = compareLedgerValues('not json', '{"a":1}');
    assert.equal(diff.parseFailed, true);
    assert.equal(countFieldChanges(diff), 0);
}

function testCompareFlagsNonObjectJson(): void {
    // A bare array or primitive has no field structure to diff.
    assert.equal(compareLedgerValues('[1,2]', '[1,3]').parseFailed, true);
    assert.equal(compareLedgerValues('"text"', '"other"').parseFailed, true);
    assert.equal(compareLedgerValues('null', '{}').parseFailed, true);
}

function testCompareDistinguishesUndefinedFromMissingKey(): void {
    // A key explicitly set to null is present, not absent.
    const diff = compareLedgerValues('{"a":null}', '{}');
    assert.deepEqual(diff.removed, { a: null });
}

// ---------------------------------------------------------------------------
// countFieldChanges
// ---------------------------------------------------------------------------

function testCountFieldChangesExcludesUnchanged(): void {
    const diff = compareLedgerValues('{"a":1,"b":2}', '{"a":1,"b":3,"c":4}');
    assert.equal(countFieldChanges(diff), 2);
}

// ---------------------------------------------------------------------------
// filterStateChanges
// ---------------------------------------------------------------------------

function testFilterAllReturnsEverything(): void {
    assert.deepEqual(filterStateChanges(changes, 'all').map((c) => c.id), ['e1', 'e2', 'e3', 'e4']);
}

function testFilterByType(): void {
    assert.deepEqual(filterStateChanges(changes, 'updated').map((c) => c.id), ['e2', 'e4']);
    assert.deepEqual(filterStateChanges(changes, 'created').map((c) => c.id), ['e1']);
    assert.deepEqual(filterStateChanges(changes, 'deleted').map((c) => c.id), ['e3']);
}

function testFilterEmptyInput(): void {
    assert.deepEqual(filterStateChanges([], 'created'), []);
}

function testFilterDoesNotMutateInput(): void {
    const original = [...changes];
    filterStateChanges(changes, 'all').pop();
    assert.deepEqual(changes, original);
}

// ---------------------------------------------------------------------------
// summarizeStateChanges / countForFilter
// ---------------------------------------------------------------------------

function testSummarizeCounts(): void {
    assert.deepEqual(summarizeStateChanges(changes), {
        total: 4,
        created: 1,
        updated: 2,
        deleted: 1,
    });
}

function testSummarizeEmpty(): void {
    assert.deepEqual(summarizeStateChanges([]), {
        total: 0,
        created: 0,
        updated: 0,
        deleted: 0,
    });
}

function testCountForFilterMatchesSummary(): void {
    const summary = summarizeStateChanges(changes);
    for (const { id } of STATE_CHANGE_FILTERS) {
        assert.equal(countForFilter(summary, id), filterStateChanges(changes, id).length);
    }
}

// ---------------------------------------------------------------------------
// formatLedgerValue
// ---------------------------------------------------------------------------

function testFormatLedgerValuePrettyPrints(): void {
    assert.equal(formatLedgerValue('{"a":1}'), '{\n  "a": 1\n}');
}

function testFormatLedgerValuePassesThroughNonJson(): void {
    assert.equal(formatLedgerValue('raw bytes'), 'raw bytes');
}

function testFormatLedgerValueHandlesMissing(): void {
    assert.equal(formatLedgerValue(undefined), '');
    assert.equal(formatLedgerValue(''), '');
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testCompareClassifiesEveryKey();
testCompareTreatsMissingBeforeAsCreation();
testCompareTreatsMissingAfterAsDeletion();
testCompareBothMissing();
testCompareComparesNestedValuesStructurally();
testCompareDetectsNestedDifference();
testCompareFlagsMalformedJson();
testCompareFlagsNonObjectJson();
testCompareDistinguishesUndefinedFromMissingKey();

testCountFieldChangesExcludesUnchanged();

testFilterAllReturnsEverything();
testFilterByType();
testFilterEmptyInput();
testFilterDoesNotMutateInput();

testSummarizeCounts();
testSummarizeEmpty();
testCountForFilterMatchesSummary();

testFormatLedgerValuePrettyPrints();
testFormatLedgerValuePassesThroughNonJson();
testFormatLedgerValueHandlesMissing();

console.log('state-diff-utils.test.ts: all assertions passed');
