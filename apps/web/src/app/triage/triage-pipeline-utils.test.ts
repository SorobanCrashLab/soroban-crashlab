import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FuzzingRun } from '../types';
import {
  applyMove,
  setPersistTransportOverride,
  OptimisticMovePipeline,
  TriageMove,
  ToastNotification,
} from './triage-pipeline-utils';

describe('Optimistic Triage Pipeline', () => {
  const initialRuns: FuzzingRun[] = [
    { id: 'run-1', status: 'failed', area: 'auth', severity: 'high', duration: 1000, seedCount: 100, cpuInstructions: 10, memoryBytes: 10, minResourceFee: 10 },
    { id: 'run-2', status: 'running', area: 'storage', severity: 'medium', duration: 2000, seedCount: 200, cpuInstructions: 20, memoryBytes: 20, minResourceFee: 20 },
    { id: 'run-3', status: 'cancelled', area: 'vm', severity: 'low', duration: 3000, seedCount: 300, cpuInstructions: 30, memoryBytes: 30, minResourceFee: 30 },
  ];

  beforeEach(() => {
    setPersistTransportOverride(null);
  });

  afterEach(() => {
    setPersistTransportOverride(null);
  });

  it('applyMove transforms run status pure function', () => {
    const move: TriageMove = { runId: 'run-1', targetColumn: 'active', targetStatus: 'running' };
    const updated = applyMove(initialRuns, move);

    expect(updated.find((r) => r.id === 'run-1')?.status).toBe('running');
    expect(initialRuns.find((r) => r.id === 'run-1')?.status).toBe('failed'); // Unmutated original
  });

  it('applies move optimistically immediately and remains silent on success', async () => {
    setPersistTransportOverride(async () => true);

    let state: FuzzingRun[] = [...initialRuns];
    const toasts: ToastNotification[] = [];

    const pipeline = new OptimisticMovePipeline(
      initialRuns,
      (runs) => { state = runs; },
      (toast) => { toasts.push(toast); },
    );

    const move: TriageMove = { runId: 'run-1', targetColumn: 'active', targetStatus: 'running' };
    const movePromise = pipeline.submitMove(move);

    // Synchronously updated immediately before network resolves!
    expect(state.find((r) => r.id === 'run-1')?.status).toBe('running');

    const success = await movePromise;
    expect(success).toBe(true);
    expect(state.find((r) => r.id === 'run-1')?.status).toBe('running');
    expect(toasts.length).toBe(0); // Success path remains silent
  });

  it('rolls back exactly to pre-move snapshot and triggers error toast on failure', async () => {
    setPersistTransportOverride(async () => false);

    let state: FuzzingRun[] = [...initialRuns];
    const toasts: ToastNotification[] = [];

    const pipeline = new OptimisticMovePipeline(
      initialRuns,
      (runs) => { state = runs; },
      (toast) => { toasts.push(toast); },
    );

    const move: TriageMove = { runId: 'run-1', targetColumn: 'cancelled', targetStatus: 'cancelled' };
    const movePromise = pipeline.submitMove(move);

    // Optimistically updated
    expect(state.find((r) => r.id === 'run-1')?.status).toBe('cancelled');

    const success = await movePromise;
    expect(success).toBe(false);

    // Rolled back to initial status
    expect(state.find((r) => r.id === 'run-1')?.status).toBe('failed');
    expect(toasts.length).toBe(1);
    expect(toasts[0].variant).toBe('error');
    expect(toasts[0].message).toContain('Failed to move run run-1');
  });

  it('serializes rapid successive moves and handles middle failure with correct final consistency', async () => {
    const moveLog: string[] = [];

    // Custom transport simulating delays and a middle failure for move #2
    setPersistTransportOverride(async (move) => {
      moveLog.push(`start:${move.runId}:${move.targetColumn}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (move.runId === 'run-2') {
        moveLog.push(`fail:${move.runId}`);
        return false;
      }
      moveLog.push(`success:${move.runId}`);
      return true;
    });

    let state: FuzzingRun[] = [...initialRuns];
    const toasts: ToastNotification[] = [];

    const pipeline = new OptimisticMovePipeline(
      initialRuns,
      (runs) => { state = runs; },
      (toast) => { toasts.push(toast); },
    );

    // Rapid successive moves
    const move1: TriageMove = { runId: 'run-1', targetColumn: 'active', targetStatus: 'running' };
    const move2: TriageMove = { runId: 'run-2', targetColumn: 'cancelled', targetStatus: 'cancelled' };
    const move3: TriageMove = { runId: 'run-3', targetColumn: 'failed', targetStatus: 'failed' };

    const p1 = pipeline.submitMove(move1);
    const p2 = pipeline.submitMove(move2);
    const p3 = pipeline.submitMove(move3);

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(res1).toBe(true);
    expect(res2).toBe(false); // Middle move failed
    expect(res3).toBe(true);

    // Verify move 1 succeeded (run-1 -> running)
    expect(state.find((r) => r.id === 'run-1')?.status).toBe('running');
    // Verify move 2 failed and rolled back (run-2 -> running, initial state)
    expect(state.find((r) => r.id === 'run-2')?.status).toBe('running');
    // Verify move 3 succeeded (run-3 -> failed)
    expect(state.find((r) => r.id === 'run-3')?.status).toBe('failed');

    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toContain('run-2');
  });
});
