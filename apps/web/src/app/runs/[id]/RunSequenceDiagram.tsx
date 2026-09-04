'use client';

/**
 * Run sequence diagram view for contract call order (#1126).
 *
 * Shows the ordered chain of contract-to-contract calls a run produced: a
 * filter chip per outcome, and a vertical call list indented by nesting depth
 * so callers and callees read like a sequence diagram's lifelines.
 *
 * Filtering/summary logic lives in `run-sequence-diagram-utils` so it can be
 * unit-tested against the same code this component runs. Colours come from
 * the Navy Professional CSS variables, so both themes are covered without a
 * second palette.
 *
 * Recursive/cyclic call chains (#1360) are resolved to distinct call frames
 * via `computeCallFrames`, so a contract re-entering itself (or a cycle like
 * A -> B -> A) is labelled with its recursion instance (e.g. "mint #2")
 * instead of being indistinguishable from its own earlier activation. Traces
 * deep enough to need more than `MAX_INLINE_LANE_DEPTH` levels of indent
 * scroll horizontally rather than compressing.
 */

import React, { useMemo, useState } from 'react';
import type { ContractCallStatus, ContractCallStep } from '../../types';
import {
  CALL_STATUS_FILTERS,
  computeCallFrames,
  countForCallFilter,
  exceedsInlineLaneDepth,
  filterCallSteps,
  formatCallDuration,
  formatLaneLabel,
  getCallLanes,
  getCallParticipants,
  summarizeCallSequence,
  type CallFrameAssignment,
  type CallStatusFilter,
} from './run-sequence-diagram-utils';

interface RunSequenceDiagramProps {
  steps: ContractCallStep[];
  /** Renders a skeleton while the call trace is still being fetched. */
  isLoading?: boolean;
  /** Message to surface instead of the diagram when loading failed. */
  error?: string | null;
}

const STATUS_COLORS: Record<ContractCallStatus, string> = {
  success: '#057642',
  failed: '#CC1016',
  pending: '#B7770F',
};

/** Tinted pill matching the semantic colour of a call's outcome. */
function StatusBadge({ status }: { status: ContractCallStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="badge text-xs"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      className="rounded-xl border border-dashed p-8 text-center"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg)' }}
    >
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      <p className="text-meta mt-1">{hint}</p>
    </div>
  );
}

export default function RunSequenceDiagram({
  steps,
  isLoading = false,
  error = null,
}: RunSequenceDiagramProps) {
  const [filter, setFilter] = useState<CallStatusFilter>('all');

  const summary = useMemo(() => summarizeCallSequence(steps), [steps]);
  const visibleSteps = useMemo(() => filterCallSteps(steps, filter), [steps, filter]);
  const participants = useMemo(() => getCallParticipants(steps), [steps]);

  // Frame identity has to be derived from the *full* trace, not the filtered
  // view: a recursive call's instance number depends on which of its
  // ancestors are still open on the call stack, and filtering can hide those
  // ancestors without changing what depth actually happened.
  const frameByStepId = useMemo(() => {
    const frames = computeCallFrames(steps);
    return new Map<string, CallFrameAssignment>(frames.map((frame) => [frame.step.id, frame]));
  }, [steps]);
  const lanes = useMemo(() => getCallLanes(steps), [steps]);
  const needsHorizontalScroll = useMemo(() => exceedsInlineLaneDepth(lanes), [lanes]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border p-4"
        style={{ borderColor: '#CC1016', background: 'rgba(204, 16, 22, 0.06)' }}
      >
        <p className="text-sm font-semibold" style={{ color: '#CC1016' }}>
          Could not load the call sequence
        </p>
        <p className="text-meta mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <span className="sr-only">Loading run sequence diagram</span>
        <div className="skeleton h-8 w-64" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <EmptyState
        title="No contract calls recorded"
        hint="Runs still in flight have not committed a final call trace yet. The sequence appears once the run finishes."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by call outcome">
          {CALL_STATUS_FILTERS.map((option) => {
            const isActive = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={isActive}
                className={`chip text-xs ${isActive ? 'chip-active' : ''}`}
              >
                {option.label} ({countForCallFilter(summary, option.id)})
              </button>
            );
          })}
        </div>

        <p className="text-meta">
          {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
          {' · '}
          {formatCallDuration(summary.totalDurationMs)} total
        </p>
      </div>

      {visibleSteps.length === 0 ? (
        <EmptyState
          title="No calls match this filter"
          hint={`This run has no ${filter} calls. Choose a different outcome above.`}
        />
      ) : (
        // Deep recursive traces get real horizontal room to breathe instead of
        // compressing each level's indent into illegibility; shallow traces
        // (the common case) render exactly as before.
        <div style={needsHorizontalScroll ? { overflowX: 'auto' } : undefined}>
          <ol
            className="space-y-2"
            style={needsHorizontalScroll ? { minWidth: `${(summary.maxDepth + 4) * 1.5}rem` } : undefined}
          >
            {visibleSteps.map((step) => {
              const frame = frameByStepId.get(step.id);
              const calleeInstance = frame?.calleeLane.instance ?? 1;
              const isRecursiveFrame = calleeInstance > 1;
              const callerLabel = frame ? formatLaneLabel(frame.callerLane.name, frame.callerLane.instance) : step.caller;
              const calleeLabel = frame ? formatLaneLabel(frame.calleeLane.name, frame.calleeLane.instance) : step.callee;

              return (
                <li
                  key={step.id}
                  className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
                  style={{
                    borderColor: 'var(--border-color)',
                    background: 'var(--surface)',
                    marginLeft: `${step.depth * 1.5}rem`,
                    // Each recursion level gets a slightly hotter accent so
                    // adjacent recursive edges read as distinct steps rather
                    // than one smeared line; non-recursive calls keep the
                    // plain border they always had.
                    borderLeftWidth: isRecursiveFrame ? '3px' : undefined,
                    borderLeftColor: isRecursiveFrame
                      ? `hsl(${210 + ((calleeInstance - 1) * 35) % 150}, 70%, 45%)`
                      : undefined,
                  }}
                >
                  <span className="code-text" style={{ color: 'var(--text-secondary)' }}>
                    #{step.sequence}
                  </span>
                  <span className="code-text font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {callerLabel}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>→</span>
                  <span className="code-text font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {calleeLabel}
                  </span>
                  <span className="code-text" style={{ color: 'var(--text-secondary)' }}>
                    .{step.method}()
                  </span>
                  <StatusBadge status={step.status} />
                  <span className="text-meta ml-auto">{formatCallDuration(step.durationMs)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
