/**
 * Pure helpers behind the run sequence diagram view (#1126).
 *
 * This logic lives outside the component so it can be unit-tested with plain
 * Node, and so the tests exercise the same code the UI runs instead of a copy
 * of it. The recursion-aware lane/edge layout math added for #1360 lives here
 * too, for the same reason.
 */

import type { ContractCallStatus, ContractCallStep } from '../../types';

/** Filter applied to the call list; `all` disables filtering. */
export type CallStatusFilter = 'all' | ContractCallStatus;

export const CALL_STATUS_FILTERS: readonly { id: CallStatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'success', label: 'Success' },
    { id: 'failed', label: 'Failed' },
    { id: 'pending', label: 'Pending' },
];

/** Returns the calls matching `filter`, preserving input order. */
export function filterCallSteps(
    steps: readonly ContractCallStep[],
    filter: CallStatusFilter,
): ContractCallStep[] {
    if (filter === 'all') return [...steps];
    return steps.filter((step) => step.status === filter);
}

/** Per-status totals used by the summary strip and the filter chip counts. */
export interface CallSequenceSummary {
    total: number;
    success: number;
    failed: number;
    pending: number;
    maxDepth: number;
    totalDurationMs: number;
}

export function summarizeCallSequence(
    steps: readonly ContractCallStep[],
): CallSequenceSummary {
    const summary: CallSequenceSummary = {
        total: steps.length,
        success: 0,
        failed: 0,
        pending: 0,
        maxDepth: 0,
        totalDurationMs: 0,
    };

    for (const step of steps) {
        if (step.status === 'success') summary.success += 1;
        else if (step.status === 'failed') summary.failed += 1;
        else if (step.status === 'pending') summary.pending += 1;

        if (step.depth > summary.maxDepth) summary.maxDepth = step.depth;
        summary.totalDurationMs += step.durationMs;
    }

    return summary;
}

/** Count for a single filter, so chips can show how much each one holds. */
export function countForCallFilter(
    summary: CallSequenceSummary,
    filter: CallStatusFilter,
): number {
    return filter === 'all' ? summary.total : summary[filter];
}

/**
 * Ordered, de-duplicated list of participants (callers and callees) as they
 * first appear in the sequence — the "lanes" a sequence diagram would draw.
 */
export function getCallParticipants(steps: readonly ContractCallStep[]): string[] {
    const seen = new Set<string>();
    const participants: string[] = [];

    for (const step of steps) {
        if (!seen.has(step.caller)) {
            seen.add(step.caller);
            participants.push(step.caller);
        }
        if (!seen.has(step.callee)) {
            seen.add(step.callee);
            participants.push(step.callee);
        }
    }

    return participants;
}

/** Human-readable duration: milliseconds under a second, seconds beyond it. */
export function formatCallDuration(durationMs: number): string {
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Recursion-aware lane layout (#1360)
//
// `getCallParticipants` above keys a participant by name alone, which is the
// right thing for the "N participants" summary but the wrong thing for laying
// out a sequence diagram: a contract that calls itself (or that sits in a
// mutual-recursion cycle like A -> B -> A) is a *different* call frame each
// time, and needs its own lane so edges between frames don't stack on top of
// one another. The functions below derive that frame identity from `depth`
// (falling back to nothing fancier than a call-stack walk, since the trace
// doesn't carry an explicit frame id) and expose it as plain data a renderer
// can lay out however it likes.
// ---------------------------------------------------------------------------

/** Depth beyond which lanes should scroll horizontally instead of compressing. */
export const MAX_INLINE_LANE_DEPTH = 8;

/** One lifeline/column: a single call frame's activation, identified beyond just its name. */
export interface CallLane {
    /** Stable identity for this frame: the bare name, or `name#instance` once it recurs. */
    key: string;
    /** Contract or account name this lane belongs to. */
    name: string;
    /** 1-based count of same-name activations open on the call stack, including this one. */
    instance: number;
    /** Nesting depth this frame opened at (-1 for the implicit caller of the very first step). */
    depth: number;
    /** Display label: the bare name normally, `"name #instance"` once it recurs. */
    label: string;
    /** 0-based column position, in the order lanes were first opened. */
    x: number;
}

/** A caller→callee edge for one call step, resolved to the lanes it connects. */
export interface CallEdge {
    stepId: string;
    callerLaneKey: string;
    calleeLaneKey: string;
    callerX: number;
    calleeX: number;
    /**
     * 0-based stacking index among edges already drawn between the same
     * (caller name → callee name) pair. Self-recursion and call cycles reuse
     * the same pair on every level, so without this every level's edge would
     * be drawn on the same line; each repeat nudges outward by one more step
     * so adjacent recursive edges stay visually distinguishable.
     */
    offset: number;
}

/** A step's caller and callee resolved to the (unique-per-frame) lanes they occupy. */
export interface CallFrameAssignment {
    step: ContractCallStep;
    callerLane: Pick<CallLane, 'key' | 'name' | 'instance' | 'depth'>;
    calleeLane: Pick<CallLane, 'key' | 'name' | 'instance' | 'depth'>;
}

interface OpenFrame {
    key: string;
    name: string;
    instance: number;
    depth: number;
}

function laneKeyFor(name: string, instance: number): string {
    return instance <= 1 ? name : `${name}#${instance}`;
}

/** Bare name normally, `"name #instance"` once a name recurs while already active. */
export function formatLaneLabel(name: string, instance: number): string {
    return instance <= 1 ? name : `${name} #${instance}`;
}

/**
 * Walks the call trace in order, tracking the open-frame call stack implied
 * by each step's `depth`, so a contract re-entered while its earlier
 * activation is still on the stack (direct self-recursion, or a cycle like
 * A -> B -> A) gets a distinct frame identity instead of collapsing onto the
 * one lane its name would otherwise imply. A name called again only after its
 * earlier activation has closed is treated as the same, non-recursive lane.
 *
 * Trace order is taken from `sequence`, not input array order, so callers can
 * pass steps in whatever order they were fetched or filtered.
 */
export function computeCallFrames(steps: readonly ContractCallStep[]): CallFrameAssignment[] {
    const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);
    const stack: OpenFrame[] = [];
    const frames: CallFrameAssignment[] = [];

    for (const step of ordered) {
        // Unwind back to the frame this call was made from.
        while (stack.length > 0 && stack[stack.length - 1].depth >= step.depth) {
            stack.pop();
        }

        let callerFrame = stack[stack.length - 1];
        if (!callerFrame || callerFrame.name !== step.caller) {
            // Either the very first step, or the caller's earlier activation
            // (if any) already closed: it re-enters as a fresh, non-recursive frame.
            callerFrame = { key: laneKeyFor(step.caller, 1), name: step.caller, instance: 1, depth: step.depth - 1 };
            stack.push(callerFrame);
        }

        const openInstances = stack.filter((frame) => frame.name === step.callee).length;
        const instance = openInstances + 1;
        const calleeFrame: OpenFrame = {
            key: laneKeyFor(step.callee, instance),
            name: step.callee,
            instance,
            depth: step.depth,
        };
        stack.push(calleeFrame);

        frames.push({
            step,
            callerLane: { key: callerFrame.key, name: callerFrame.name, instance: callerFrame.instance, depth: callerFrame.depth },
            calleeLane: { key: calleeFrame.key, name: calleeFrame.name, instance: calleeFrame.instance, depth: calleeFrame.depth },
        });
    }

    return frames;
}

/**
 * Ordered, de-duplicated lanes a sequence diagram should draw as columns:
 * one per distinct call frame, in first-appearance order. Recursive frames of
 * the same name get their own lane and column position instead of collapsing
 * into the lane their first activation used.
 */
export function getCallLanes(steps: readonly ContractCallStep[]): CallLane[] {
    const frames = computeCallFrames(steps);
    const seen = new Map<string, CallLane>();
    let nextX = 0;

    for (const frame of frames) {
        for (const lane of [frame.callerLane, frame.calleeLane]) {
            if (seen.has(lane.key)) continue;
            seen.set(lane.key, {
                key: lane.key,
                name: lane.name,
                instance: lane.instance,
                depth: lane.depth,
                label: formatLaneLabel(lane.name, lane.instance),
                x: nextX,
            });
            nextX += 1;
        }
    }

    return Array.from(seen.values());
}

/**
 * Caller→callee edges for the trace, positioned against `getCallLanes`'
 * column order and offset so repeated edges between the same name pair (the
 * hallmark of self-recursion and call cycles) don't render on top of each
 * other.
 */
export function getCallEdges(steps: readonly ContractCallStep[]): CallEdge[] {
    const frames = computeCallFrames(steps);
    const lanes = getCallLanes(steps);
    const xByKey = new Map(lanes.map((lane) => [lane.key, lane.x]));
    const pairCounts = new Map<string, number>();

    return frames.map((frame) => {
        const pairKey = `${frame.callerLane.name}->${frame.calleeLane.name}`;
        const offset = pairCounts.get(pairKey) ?? 0;
        pairCounts.set(pairKey, offset + 1);

        return {
            stepId: frame.step.id,
            callerLaneKey: frame.callerLane.key,
            calleeLaneKey: frame.calleeLane.key,
            callerX: xByKey.get(frame.callerLane.key) ?? 0,
            calleeX: xByKey.get(frame.calleeLane.key) ?? 0,
            offset,
        };
    });
}

/**
 * Whether any lane opened deep enough that inline rendering would need to
 * shrink lanes below legibility. Callers should switch to horizontal
 * scrolling instead of compressing column width when this is true.
 */
export function exceedsInlineLaneDepth(
    lanes: readonly CallLane[],
    limit: number = MAX_INLINE_LANE_DEPTH,
): boolean {
    return lanes.some((lane) => lane.depth > limit);
}
