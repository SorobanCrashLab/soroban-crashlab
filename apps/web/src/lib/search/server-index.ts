import type { FuzzingRun } from '@/app/types';
import type { RunStorageDriver } from '@/lib/storage/run-driver';
import { createRunSearchIndex, RunSearchIndex } from './index';
import { runToSearchDocument } from './run-document';

const indexes = new WeakMap<RunStorageDriver, Promise<RunSearchIndex>>();

export function getRunSearchIndex(driver: RunStorageDriver): Promise<RunSearchIndex> {
  const existing = indexes.get(driver);
  if (existing) return existing;

  const ready = (async () => {
    const { runs } = await driver.listRuns();
    return createRunSearchIndex(runs.map(runToSearchDocument));
  })().catch((error: unknown) => {
    indexes.delete(driver);
    throw error;
  });

  indexes.set(driver, ready);
  return ready;
}

export async function upsertRunInSearchIndex(
  driver: RunStorageDriver,
  run: FuzzingRun,
): Promise<void> {
  const ready = indexes.get(driver);
  if (!ready) return;
  const index = await ready;
  index.upsertDocument(runToSearchDocument(run));
}

export async function removeRunFromSearchIndex(
  driver: RunStorageDriver,
  runId: string,
): Promise<void> {
  const ready = indexes.get(driver);
  if (!ready) return;
  const index = await ready;
  index.removeDocument(runId);
}

export function resetRunSearchIndex(driver: RunStorageDriver): void {
  indexes.delete(driver);
}
