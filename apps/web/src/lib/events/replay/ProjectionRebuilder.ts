import { EventReplayer } from './EventReplayer';
import { getProjectionManager } from '../projections/ProjectionManager';

export async function rebuildProjections(projectionName?: 'dashboard' | 'runs' | 'analytics') {
  const manager = getProjectionManager();
  manager.reset();
  const replayer = new EventReplayer();
  const result = await replayer.replay((event) => manager.apply(event));
  return { ...result, projection: projectionName ?? 'all', snapshot: manager.snapshot() };
}
