/**
 * Artifact lineage graph (#2342).
 *
 * Walks parent and child artifact relations up to `depth` hops from a root
 * and attaches the run/campaign/crash/report each artifact belongs to. The
 * layout is a deterministic layered one (columns = generation relative to
 * the root) so the SVG view needs no layout library.
 */

import type { LineageRelation, ManagedArtifact } from './model';

export type LineageNodeKind = 'artifact' | 'run' | 'campaign' | 'crash' | 'report';

export interface LineageNode {
  id: string;
  kind: LineageNodeKind;
  label: string;
  /** Generation relative to the root (negative = ancestors). Entities sit left of everything. */
  column: number;
  row: number;
  root?: boolean;
  artifactType?: ManagedArtifact['type'];
  trust?: 'trusted' | 'warning' | 'blocked';
  href?: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  relation: LineageRelation | 'belongs-to';
}

export interface LineageGraph {
  rootId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  truncated: boolean;
}

export const MAX_LINEAGE_NODES = 60;

export function buildLineage(
  catalog: readonly ManagedArtifact[],
  rootId: string,
  depth = 2,
  trustOf: (artifact: ManagedArtifact) => LineageNode['trust'] = () => undefined,
): LineageGraph | null {
  const byId = new Map(catalog.map((artifact) => [artifact.id, artifact]));
  const root = byId.get(rootId);
  if (!root) return null;
  const children = new Map<string, Array<{ id: string; relation: LineageRelation }>>();
  for (const artifact of catalog) {
    for (const parent of artifact.lineage) {
      const list = children.get(parent.artifactId) ?? [];
      list.push({ id: artifact.id, relation: parent.relation });
      children.set(parent.artifactId, list);
    }
  }

  const generation = new Map<string, number>([[rootId, 0]]);
  const edges: LineageEdge[] = [];
  const queue: string[] = [rootId];
  let truncated = false;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const level = generation.get(id)!;
    if (Math.abs(level) >= depth) continue;
    const artifact = byId.get(id)!;
    const neighbours = [
      ...artifact.lineage.map((parent) => ({ id: parent.artifactId, relation: parent.relation, level: level - 1, parentOf: id })),
      ...(children.get(id) ?? []).map((child) => ({ id: child.id, relation: child.relation, level: level + 1, parentOf: null })),
    ];
    for (const neighbour of neighbours) {
      if (!byId.has(neighbour.id)) continue;
      const edge: LineageEdge = neighbour.parentOf
        ? { from: neighbour.id, to: neighbour.parentOf, relation: neighbour.relation }
        : { from: id, to: neighbour.id, relation: neighbour.relation };
      if (!edges.some((existing) => existing.from === edge.from && existing.to === edge.to)) edges.push(edge);
      if (generation.has(neighbour.id)) continue;
      if (generation.size >= MAX_LINEAGE_NODES) {
        truncated = true;
        continue;
      }
      generation.set(neighbour.id, neighbour.level);
      queue.push(neighbour.id);
    }
  }

  const minColumn = Math.min(...generation.values());
  const entityColumn = minColumn - 1;
  const rows = new Map<number, number>();
  const place = (column: number) => {
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return row;
  };

  const nodes: LineageNode[] = [];
  const entityIds = new Set<string>();
  const addEntity = (kind: Exclude<LineageNodeKind, 'artifact'>, id: string | null, artifactId: string) => {
    if (!id) return;
    const nodeId = `${kind}:${id}`;
    if (!entityIds.has(nodeId)) {
      entityIds.add(nodeId);
      const href =
        kind === 'run' ? `/runs/${encodeURIComponent(id)}` : kind === 'campaign' ? `/campaigns/${encodeURIComponent(id)}` : kind === 'report' ? `/reports/${encodeURIComponent(id)}` : `/triage?crash=${encodeURIComponent(id)}`;
      nodes.push({ id: nodeId, kind, label: id, column: kind === 'report' ? Number.NaN : entityColumn, row: 0, href });
    }
    edges.push({ from: nodeId, to: artifactId, relation: 'belongs-to' });
  };

  const ordered = [...generation.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  for (const [id, column] of ordered) {
    const artifact = byId.get(id)!;
    nodes.push({
      id,
      kind: 'artifact',
      label: artifact.name,
      column,
      row: place(column),
      root: id === rootId,
      artifactType: artifact.type,
      trust: trustOf(artifact),
    });
  }
  for (const [id] of ordered) {
    const artifact = byId.get(id)!;
    addEntity('campaign', artifact.campaignId, id);
    addEntity('run', artifact.runId, id);
    addEntity('crash', artifact.crashId, id);
    addEntity('report', artifact.reportId, id);
  }
  const maxColumn = Math.max(...generation.values());
  for (const node of nodes) {
    if (node.kind === 'artifact') continue;
    if (Number.isNaN(node.column)) node.column = maxColumn + 1;
    node.row = place(node.column);
  }
  const present = new Set(nodes.map((node) => node.id));
  return {
    rootId,
    nodes,
    edges: edges.filter((edge) => present.has(edge.from) && present.has(edge.to)),
    truncated,
  };
}
