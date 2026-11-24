/**
 * Adapter registry (#2339). Only the entities a query touches are loaded,
 * and an adapter failure degrades that entity to zero rows with a warning
 * instead of failing the whole query.
 */

import type { Datasets } from '../lib/engine';
import type { EntityName } from '../lib/schema';
import { ciAdapter } from './ci';
import { logsAdapter } from './logs';
import { crashesAdapter, metricsAdapter, runsAdapter, tracesAdapter } from './runs';
import type { DatasetAdapter } from './types';

export const ADAPTERS: Record<EntityName, DatasetAdapter> = {
  runs: runsAdapter,
  crashes: crashesAdapter,
  logs: logsAdapter,
  traces: tracesAdapter,
  metrics: metricsAdapter,
  ci: ciAdapter,
};

export interface LoadedDatasets {
  datasets: Datasets;
  warnings: string[];
}

export async function loadDatasets(
  entities: readonly EntityName[],
  adapters: Record<EntityName, DatasetAdapter> = ADAPTERS,
): Promise<LoadedDatasets> {
  const datasets: Datasets = {};
  const warnings: string[] = [];
  await Promise.all(
    [...new Set(entities)].map(async (entity) => {
      try {
        datasets[entity] = await adapters[entity].load();
      } catch (error) {
        datasets[entity] = [];
        warnings.push(`${entity} adapter (${adapters[entity].sourceLabel}) is unavailable: ${(error as Error).message}`);
      }
    }),
  );
  return { datasets, warnings };
}

export type { DatasetAdapter } from './types';
