/**
 * Lazy diff task runner.
 *
 * The heavy diff modules are dynamically imported on first use so the workbench
 * stays under its bundle budget. The task API mirrors a Web Worker pool; a
 * future wasm bsdiff worker can implement `runTask` without changing callers.
 */

import type { ArtifactDiffKind, ArtifactDiffResult } from "../types";
import type { DiffInput } from "./diffEngine";

export interface DiffTask extends DiffInput {
  id: number;
  /** Larger artifacts are processed first. */
  weight: number;
}

interface PendingTask {
  task: DiffTask;
  resolve: (result: ArtifactDiffResult) => void;
  reject: (error: unknown) => void;
}

const MAX_CONCURRENT = 2;
const queue: PendingTask[] = [];
let active = 0;
let nextId = 1;

function schedule(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const pending = queue.shift();
    if (!pending) return;
    active += 1;
    void runTask(pending.task)
      .then(pending.resolve, pending.reject)
      .finally(() => {
        active -= 1;
        schedule();
      });
  }
}

/** Execute one diff task. Modules are loaded on demand and shared via import cache. */
export async function runTask(task: DiffInput): Promise<ArtifactDiffResult> {
  const { runDiff } = await import("./diffEngine");
  return runDiff(task);
}

export function enqueueDiff(input: DiffInput): Promise<ArtifactDiffResult> {
  const task: DiffTask = {
    ...input,
    id: nextId++,
    weight: typeof input.before === "string" ? input.before.length : input.before.byteLength,
  };
  return new Promise<ArtifactDiffResult>((resolve, reject) => {
    queue.push({ task, resolve, reject });
    queue.sort((a, b) => b.task.weight - a.task.weight);
    schedule();
  });
}

export function diffQueueSize(): number {
  return queue.length + active;
}

export function resetDiffQueue(): void {
  queue.length = 0;
  active = 0;
}

export function isBinaryKind(kind: ArtifactDiffKind): boolean {
  return kind === "binary";
}
