'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FuzzingRun, RunStatus } from './types';

/* ── Types ─────────────────────────────────────────────────────────── */

export type WorkflowState = 'open' | 'in-review' | 'closed';

export interface RunWorkflowState {
  runId: string;
  workflowState: WorkflowState;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STORAGE_KEY = 'crashlab-run-workflow-states';

const WORKFLOW_COLUMNS: { state: WorkflowState; label: string; color: string }[] = [
  { state: 'open', label: 'Open', color: 'blue' },
  { state: 'in-review', label: 'In Review', color: 'amber' },
  { state: 'closed', label: 'Closed', color: 'green' },
];

const COLUMN_COLORS: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
};

const HEADER_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
  amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200',
  green: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
};

const CARD_COLORS: Record<RunStatus, string> = {
  running: 'border-l-blue-500',
  completed: 'border-l-green-500',
  failed: 'border-l-red-500',
  cancelled: 'border-l-zinc-400',
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function loadWorkflowStates(): Map<string, WorkflowState> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as RunWorkflowState[];
    return new Map(parsed.map((item) => [item.runId, item.workflowState]));
  } catch {
    return new Map();
  }
}

function saveWorkflowStates(states: Map<string, WorkflowState>) {
  const data: RunWorkflowState[] = Array.from(states.entries()).map(([runId, workflowState]) => ({
    runId,
    workflowState,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getWorkflowState(
  runId: string,
  workflowStates: Map<string, WorkflowState>,
  runStatus: RunStatus
): WorkflowState {
  // If we have a saved workflow state, use it
  if (workflowStates.has(runId)) {
    return workflowStates.get(runId)!;
  }
  // Otherwise, infer from run status
  if (runStatus === 'running') return 'open';
  if (runStatus === 'completed') return 'closed';
  if (runStatus === 'failed') return 'in-review';
  return 'open';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/* ── Component ──────────────────────────────────────────────────────── */

interface Props {
  runs?: FuzzingRun[];
}

export default function ImplementRunWorkflowBoardPage58({ runs = [] }: Props) {
  const [workflowStates, setWorkflowStates] = useState<Map<string, WorkflowState>>(new Map());
  const [draggedRunId, setDraggedRunId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<WorkflowState | null>(null);

  // Load saved workflow states on mount
  useEffect(() => {
    setWorkflowStates(loadWorkflowStates());
  }, []);

  // Persist whenever workflow states change (skip initial empty render)
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) {
      saveWorkflowStates(workflowStates);
    } else {
      mounted.current = true;
    }
  }, [workflowStates]);

  // Group runs by workflow state
  const runsByState = useMemo(() => {
    const grouped: Record<WorkflowState, FuzzingRun[]> = {
      'open': [],
      'in-review': [],
      'closed': [],
    };

    runs.forEach((run) => {
      const state = getWorkflowState(run.id, workflowStates, run.status);
      grouped[state].push(run);
    });

    return grouped;
  }, [runs, workflowStates]);

  /* ── Drag-and-drop handlers ──────────────────────────────────────── */

  const handleDragStart = useCallback((runId: string) => {
    setDraggedRunId(runId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, column: WorkflowState) => {
    e.preventDefault();
    setDragOverColumn(column);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (targetState: WorkflowState) => {
      if (!draggedRunId) return;

      setWorkflowStates((prev) => {
        const next = new Map(prev);
        next.set(draggedRunId, targetState);
        return next;
      });

      setDraggedRunId(null);
      setDragOverColumn(null);
    },
    [draggedRunId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedRunId(null);
    setDragOverColumn(null);
  }, []);

  /* ── Render ──────────────────────────────────────────────────────── */

  const totalRuns = runs.length;
  const openCount = runsByState['open'].length;
  const inReviewCount = runsByState['in-review'].length;
  const closedCount = runsByState['closed'].length;

  return (
    <section aria-label="Run workflow board" className="w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Run Workflow Board</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drag and drop runs between columns to update their workflow state. Changes are automatically saved.
        </p>
        <div className="mt-3 flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span>Total: {totalRuns}</span>
          <span>Open: {openCount}</span>
          <span>In Review: {inReviewCount}</span>
          <span>Closed: {closedCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {WORKFLOW_COLUMNS.map((column) => (
          <div
            key={column.state}
            onDragOver={(e) => handleDragOver(e, column.state)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(column.state)}
            className={`rounded-xl border-2 transition-colors ${
              dragOverColumn === column.state
                ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : COLUMN_COLORS[column.color]
            }`}
          >
            {/* Column Header */}
            <div
              className={`px-4 py-3 rounded-t-xl font-semibold ${HEADER_COLORS[column.color]}`}
            >
              <div className="flex items-center justify-between">
                <span>{column.label}</span>
                <span className="text-sm font-normal opacity-75">
                  {runsByState[column.state].length}
                </span>
              </div>
            </div>

            {/* Column Content */}
            <div className="p-3 min-h-[400px] space-y-3">
              {runsByState[column.state].length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-zinc-400 dark:text-zinc-500 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg">
                  No runs
                </div>
              ) : (
                runsByState[column.state].map((run) => (
                  <div
                    key={run.id}
                    draggable
                    onDragStart={() => handleDragStart(run.id)}
                    onDragEnd={handleDragEnd}
                    className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-l-4 ${CARD_COLORS[run.status]} ${
                      draggedRunId === run.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {run.id}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          run.status === 'running'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : run.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : run.status === 'failed'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {run.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <div className="flex justify-between">
                        <span>Area:</span>
                        <span className="font-medium">{run.area}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Severity:</span>
                        <span
                          className={`font-medium ${
                            run.severity === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : run.severity === 'high'
                              ? 'text-orange-600 dark:text-orange-400'
                              : run.severity === 'medium'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {run.severity}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration:</span>
                        <span className="font-medium">{formatDuration(run.duration)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Seeds:</span>
                        <span className="font-medium">{run.seedCount.toLocaleString()}</span>
                      </div>
                    </div>

                    {run.crashDetail && (
                      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">
                          Crash: {run.crashDetail.failureCategory}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">
                          {run.crashDetail.signature}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
