import { describe, expect, it } from 'vitest';
import type { Artifact, FuzzingRun } from '@/app/types';
import type { RunStorageDriver } from './run-driver';

export interface RunDriverHarness {
  driver: RunStorageDriver;
  makeRun?: (id: string) => FuzzingRun;
}

export function runRunDriverContract(name: string, createHarness: () => RunDriverHarness): void {
  describe(`RunStorageDriver contract: ${name}`, () => {
    it('round-trips run and artifact data', async () => {
      const { driver } = createHarness();
      const run = (await driver.listRuns()).runs[0];
      expect(run).toBeDefined();
      if (!run) return;
      expect(await driver.getRun(run.id)).toEqual(run);

      const artifact: Artifact = {
        id: `${run.id}-artifact`, name: 'fixture.bin', type: 'bundle', size: 4,
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      const bytes = new Uint8Array([0, 1, 127, 255]);
      await driver.putArtifact(run.id, artifact, bytes);
      const stored = await driver.getArtifact(artifact.id);
      expect(stored?.metadata).toEqual({ ...artifact, runId: run.id });
      expect([...((stored?.bytes) ?? [])]).toEqual([...bytes]);
    });

    it('keeps filtering and totals consistent', async () => {
      const { driver } = createHarness();
      const all = await driver.listRuns();
      const running = await driver.listRuns({ status: 'running' });
      expect(running.runs.every((run) => run.status === 'running')).toBe(true);
      expect(running.total).toBe(running.runs.length);
      expect(all.total).toBeGreaterThanOrEqual(running.total);
    });

    it('deletes a run and its artifacts', async () => {
      const { driver } = createHarness();
      const run = (await driver.listRuns()).runs[0];
      if (!run) return;
      const artifact: Artifact = { id: `${run.id}-delete`, name: 'x', type: 'log', size: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
      await driver.putArtifact(run.id, artifact, new Uint8Array([1]));
      expect(await driver.deleteRun(run.id)).toBe(true);
      expect(await driver.getRun(run.id)).toBeNull();
      expect(await driver.getArtifact(artifact.id)).toBeNull();
    });

    it('handles concurrent artifact writes without byte mixing', async () => {
      const { driver } = createHarness();
      const run = (await driver.listRuns()).runs[0];
      if (!run) return;
      const writes = [1, 2, 3, 4].map((value) => driver.putArtifact(run.id, {
        id: `${run.id}-${value}`, name: `${value}.bin`, type: 'bundle', size: 1, updatedAt: '2026-01-01T00:00:00.000Z',
      }, new Uint8Array([value])));
      await Promise.all(writes);
      for (const value of [1, 2, 3, 4]) {
        const stored = await driver.getArtifact(`${run.id}-${value}`);
        expect(stored?.bytes[0]).toBe(value);
      }
    });
  });
}