/**
 * Grid clustering for the geo map (#2303). Deterministic and O(n): nodes are
 * bucketed into square cells whose size shrinks as the map zooms in, so 10k+
 * points render as a few hundred markers.
 */

import type { Health, MetricLayer, TopoNode } from './normalize';

export interface Cluster {
  id: string;
  lat: number;
  lon: number;
  count: number;
  nodeIds: string[];
  /** Worst health among members. */
  health: Health;
  /** Mean of the selected metric across members. */
  value: number;
}

const HEALTH_RANK: Record<Health, number> = { healthy: 0, degraded: 1, down: 2 };

/** Cell size in degrees for a zoom level (1 = whole world, higher = closer). */
export function cellSizeForZoom(zoom: number): number {
  return 90 / 2 ** Math.max(0, Math.min(zoom, 12));
}

export function clusterNodes(nodes: TopoNode[], zoom: number, layer: MetricLayer): Cluster[] {
  const size = cellSizeForZoom(zoom);
  const cells = new Map<string, TopoNode[]>();
  for (const n of nodes) {
    if (n.lat === null || n.lon === null) continue;
    const key = `${Math.floor((n.lat + 90) / size)}:${Math.floor((n.lon + 180) / size)}`;
    const cell = cells.get(key);
    if (cell) cell.push(n);
    else cells.set(key, [n]);
  }

  const clusters: Cluster[] = [];
  for (const [key, members] of cells) {
    members.sort((a, b) => a.id.localeCompare(b.id));
    clusters.push({
      id: `c:${key}`,
      lat: members.reduce((s, m) => s + (m.lat as number), 0) / members.length,
      lon: members.reduce((s, m) => s + (m.lon as number), 0) / members.length,
      count: members.length,
      nodeIds: members.map((m) => m.id),
      health: members.reduce<Health>((worst, m) => (HEALTH_RANK[m.health] > HEALTH_RANK[worst] ? m.health : worst), 'healthy'),
      value: members.reduce((s, m) => s + m.metrics[layer], 0) / members.length,
    });
  }
  return clusters.sort((a, b) => a.id.localeCompare(b.id));
}

/** Nodes with no usable coordinates; shown in the list/topology fallback instead of the map. */
export function unlocatedNodes(nodes: TopoNode[]): TopoNode[] {
  return nodes.filter((n) => n.lat === null || n.lon === null);
}

/** Equirectangular projection to a width x height box. */
export function project(lat: number, lon: number, width: number, height: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * width, y: ((90 - lat) / 180) * height };
}
