import * as assert from 'node:assert/strict';
import {
    CALL_STATUS_FILTERS,
    countForCallFilter,
    computeCallFrames,
    exceedsInlineLaneDepth,
    filterCallSteps,
    formatCallDuration,
    formatLaneLabel,
    getCallEdges,
    getCallLanes,
    getCallParticipants,
    MAX_INLINE_LANE_DEPTH,
    summarizeCallSequence,
} from './run-sequence-diagram-utils';
import type { ContractCallStep } from '../../types';

const steps: ContractCallStep[] = [
    { id: 'c1', sequence: 1, caller: 'harness', callee: 'token', method: 'transfer', depth: 0, status: 'success', durationMs: 10 },
    { id: 'c2', sequence: 2, caller: 'token', callee: 'account', method: 'require_auth', depth: 1, status: 'success', durationMs: 5 },
    { id: 'c3', sequence: 3, caller: 'token', callee: 'allowance', method: 'spend_allowance', depth: 1, status: 'failed', durationMs: 1200 },
];

// ---------------------------------------------------------------------------
// filterCallSteps
// ---------------------------------------------------------------------------

function testFilterAllReturnsEverything(): void {
    assert.equal(filterCallSteps(steps, 'all').length, 3);
}

function testFilterByStatus(): void {
    const failed = filterCallSteps(steps, 'failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].id, 'c3');
}

function testFilterEmptyInput(): void {
    assert.deepEqual(filterCallSteps([], 'all'), []);
    assert.deepEqual(filterCallSteps([], 'success'), []);
}

function testFilterDoesNotMutateInput(): void {
    const copy = [...steps];
    filterCallSteps(steps, 'success');
    assert.deepEqual(steps, copy);
}

// ---------------------------------------------------------------------------
// summarizeCallSequence
// ---------------------------------------------------------------------------

function testSummarizeCounts(): void {
    const summary = summarizeCallSequence(steps);
    assert.equal(summary.total, 3);
    assert.equal(summary.success, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.pending, 0);
    assert.equal(summary.maxDepth, 1);
    assert.equal(summary.totalDurationMs, 1215);
}

function testSummarizeEmpty(): void {
    const summary = summarizeCallSequence([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.maxDepth, 0);
    assert.equal(summary.totalDurationMs, 0);
}

function testCountForFilterMatchesSummary(): void {
    const summary = summarizeCallSequence(steps);
    for (const { id } of CALL_STATUS_FILTERS) {
        assert.equal(countForCallFilter(summary, id), id === 'all' ? summary.total : summary[id]);
    }
}

// ---------------------------------------------------------------------------
// getCallParticipants
// ---------------------------------------------------------------------------

function testParticipantsOrderedAndDeduplicated(): void {
    const participants = getCallParticipants(steps);
    assert.deepEqual(participants, ['harness', 'token', 'account', 'allowance']);
}

function testParticipantsEmptyInput(): void {
    assert.deepEqual(getCallParticipants([]), []);
}

// ---------------------------------------------------------------------------
// formatCallDuration
// ---------------------------------------------------------------------------

function testFormatDurationMilliseconds(): void {
    assert.equal(formatCallDuration(0), '0ms');
    assert.equal(formatCallDuration(999), '999ms');
}

function testFormatDurationSeconds(): void {
    assert.equal(formatCallDuration(1000), '1.0s');
    assert.equal(formatCallDuration(2500), '2.5s');
}

// ---------------------------------------------------------------------------
// Recursion-aware lane layout (#1360)
// ---------------------------------------------------------------------------

/** harness -> mint -> mint -> mint: direct self-recursion, three levels deep. */
const selfRecursionSteps: ContractCallStep[] = [
    { id: 'r1', sequence: 1, caller: 'harness', callee: 'mint', method: 'mint', depth: 0, status: 'success', durationMs: 4 },
    { id: 'r2', sequence: 2, caller: 'mint', callee: 'mint', method: 'mint', depth: 1, status: 'success', durationMs: 4 },
    { id: 'r3', sequence: 3, caller: 'mint', callee: 'mint', method: 'mint', depth: 2, status: 'success', durationMs: 4 },
];

/** harness -> A -> B -> A: mutual recursion, a cycle rather than a direct self-call. */
const mutualRecursionSteps: ContractCallStep[] = [
    { id: 'm1', sequence: 1, caller: 'harness', callee: 'A', method: 'call', depth: 0, status: 'success', durationMs: 3 },
    { id: 'm2', sequence: 2, caller: 'A', callee: 'B', method: 'call', depth: 1, status: 'success', durationMs: 3 },
    { id: 'm3', sequence: 3, caller: 'B', callee: 'A', method: 'call', depth: 2, status: 'success', durationMs: 3 },
];

function testFormatLaneLabel(): void {
    assert.equal(formatLaneLabel('mint', 1), 'mint');
    assert.equal(formatLaneLabel('mint', 2), 'mint #2');
    assert.equal(formatLaneLabel('mint', 3), 'mint #3');
}

function testSelfRecursionLaneCount(): void {
    const lanes = getCallLanes(selfRecursionSteps);
    assert.deepEqual(
        lanes.map((lane) => lane.key),
        ['harness', 'mint', 'mint#2', 'mint#3'],
    );
    assert.deepEqual(
        lanes.map((lane) => lane.label),
        ['harness', 'mint', 'mint #2', 'mint #3'],
    );
    // Distinct, monotonically increasing columns — no two frames share a lane.
    assert.deepEqual(lanes.map((lane) => lane.x), [0, 1, 2, 3]);
}

function testSelfRecursionFrameIdentity(): void {
    const frames = computeCallFrames(selfRecursionSteps);
    assert.equal(frames.length, 3);
    assert.equal(frames[0].calleeLane.instance, 1);
    assert.equal(frames[1].calleeLane.instance, 2);
    assert.equal(frames[2].calleeLane.instance, 3);
    // Each recursive callee is also the next call's caller frame.
    assert.equal(frames[1].callerLane.key, frames[0].calleeLane.key);
    assert.equal(frames[2].callerLane.key, frames[1].calleeLane.key);
}

function testSelfRecursionEdgeOffsetsIncreaseOnRepeat(): void {
    const edges = getCallEdges(selfRecursionSteps);
    assert.equal(edges.length, 3);
    assert.equal(edges[0].offset, 0); // harness -> mint, first of its pair
    assert.equal(edges[1].offset, 0); // mint -> mint, first of its pair
    assert.equal(edges[2].offset, 1); // mint -> mint again, bumped outward
    // Adjacent recursive frames sit in adjacent columns.
    assert.equal(edges[1].calleeX - edges[1].callerX, 1);
    assert.equal(edges[2].calleeX - edges[2].callerX, 1);
}

function testMutualRecursionLaneCount(): void {
    const lanes = getCallLanes(mutualRecursionSteps);
    assert.deepEqual(
        lanes.map((lane) => lane.key),
        ['harness', 'A', 'B', 'A#2'],
    );
    assert.deepEqual(
        lanes.map((lane) => lane.label),
        ['harness', 'A', 'B', 'A #2'],
    );
}

function testMutualRecursionDistinctPairsDoNotShareOffset(): void {
    const edges = getCallEdges(mutualRecursionSteps);
    // A -> B and B -> A are different name pairs, so the cycle is a zig-zag
    // rather than a repeated edge; neither needs to be bumped outward.
    assert.deepEqual(edges.map((edge) => edge.offset), [0, 0, 0]);
}

function testNonRecursiveBaselineLanesUnchanged(): void {
    // Same fixture used by the filter/summary tests above: no name is ever
    // re-entered while its earlier activation is still open.
    const lanes = getCallLanes(steps);
    assert.deepEqual(
        lanes.map((lane) => lane.key),
        ['harness', 'token', 'account', 'allowance'],
    );
    assert.ok(lanes.every((lane) => lane.instance === 1));
    assert.deepEqual(
        lanes.map((lane) => lane.label),
        lanes.map((lane) => lane.name),
    );
}

function testNonRecursiveBaselineEdgesUnoffset(): void {
    const edges = getCallEdges(steps);
    assert.ok(edges.every((edge) => edge.offset === 0));
}

function testExceedsInlineLaneDepth(): void {
    const shallow: ContractCallStep[] = Array.from({ length: MAX_INLINE_LANE_DEPTH + 1 }, (_, i) => ({
        id: `d${i}`,
        sequence: i + 1,
        caller: i === 0 ? 'harness' : 'chain',
        callee: 'chain',
        method: 'step',
        depth: i,
        status: 'success' as const,
        durationMs: 1,
    }));
    // Deepest lane opens at depth === MAX_INLINE_LANE_DEPTH: still inline.
    assert.equal(exceedsInlineLaneDepth(getCallLanes(shallow)), false);

    const deep = [
        ...shallow,
        {
            id: 'd-extra',
            sequence: shallow.length + 1,
            caller: 'chain',
            callee: 'chain',
            method: 'step',
            depth: MAX_INLINE_LANE_DEPTH + 1,
            status: 'success' as const,
            durationMs: 1,
        },
    ];
    // One level past the limit: should now ask for horizontal scroll.
    assert.equal(exceedsInlineLaneDepth(getCallLanes(deep)), true);
}

function testComputeCallFramesEmptyInput(): void {
    assert.deepEqual(computeCallFrames([]), []);
    assert.deepEqual(getCallLanes([]), []);
    assert.deepEqual(getCallEdges([]), []);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testFilterAllReturnsEverything();
testFilterByStatus();
testFilterEmptyInput();
testFilterDoesNotMutateInput();

testSummarizeCounts();
testSummarizeEmpty();
testCountForFilterMatchesSummary();

testParticipantsOrderedAndDeduplicated();
testParticipantsEmptyInput();

testFormatDurationMilliseconds();
testFormatDurationSeconds();

testFormatLaneLabel();
testSelfRecursionLaneCount();
testSelfRecursionFrameIdentity();
testSelfRecursionEdgeOffsetsIncreaseOnRepeat();
testMutualRecursionLaneCount();
testMutualRecursionDistinctPairsDoNotShareOffset();
testNonRecursiveBaselineLanesUnchanged();
testNonRecursiveBaselineEdgesUnoffset();
testExceedsInlineLaneDepth();
testComputeCallFramesEmptyInput();

console.log('run-sequence-diagram-utils.test.ts: all assertions passed');
