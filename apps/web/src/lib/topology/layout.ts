/**
 * Deterministic topology layout (#2303): nodes are layered by dependency depth
 * (callers on the left, dependencies on the right) and ordered by id inside
 * each layer, so the same input always produces the same picture. That makes
 * snapshot comparison and shared links reliable.
 */

import type { TopoEdge, TopoNode } from './normalize';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  layer: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  padding?: number;
}

/** Longest-path layering; cycles are broken deterministically by ignoring back edges. */
export function assignLayers(nodes: TopoNode[], edges: TopoEdge[]): Map<string, number> {
  const ids = nodes.map((n) => n.id).sort();
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    if (!out.has(e.from) || !out.has(e.to) || e.from === e.to) continue;
    out.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  for (const list of out.values()) list.sort();

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (visiting.has(id)) return; // back edge: break the cycle
    if ((layer.get(id) ?? -1) >= depth) return;
    layer.set(id, depth);
    visiting.add(id);
    for (const next of out.get(id) ?? []) visit(next, depth + 1);
    visiting.delete(id);
  };
  const roots = ids.filter((id) => indegree.get(id) === 0);
  for (const id of roots.length ? roots : ids.slice(0, 1)) visit(id, 0);
  for (const id of ids) if (!layer.has(id)) visit(id, 0); // isolated or cycle-only nodes
  return layer;
}

export function layoutTopology(nodes: TopoNode[], edges: TopoEdge[], opts: LayoutOptions): PositionedNode[] {
  const pad = opts.padding ?? 40;
  const layers = assignLayers(nodes, edges);
  const byLayer = new Map<number, string[]>();
  for (const n of nodes) {
    const l = layers.get(n.id) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), n.id]);
  }
  const layerCount = Math.max(...Array.from(byLayer.keys()), 0) + 1;
  const result: PositionedNode[] = [];
  for (const [l, ids] of byLayer) {
    ids.sort();
    ids.forEach((id, i) => {
      result.push({
        id,
        layer: l,
        x: layerCount === 1 ? opts.width / 2 : pad + (l / (layerCount - 1)) * (opts.width - pad * 2),
        y: pad + ((i + 1) / (ids.length + 1)) * (opts.height - pad * 2),
      });
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
