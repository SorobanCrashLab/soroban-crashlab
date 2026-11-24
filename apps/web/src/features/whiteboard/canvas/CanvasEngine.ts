export type WhiteboardNodeKind =
  | 'sticky'
  | 'shape'
  | 'frame'
  | 'text'
  | 'markdown'
  | 'evidence';

export interface WhiteboardNode {
  id: string;
  kind: WhiteboardNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  content: string;
  entityRef?: { type: 'run' | 'crash' | 'trace' | 'log' | 'issue'; id: string; status: string };
  updatedAt: number;
}

export interface WhiteboardEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Deterministic serializer for diffs, snapshots, and reproducible exports.
 */
export function serializeBoard(nodes: WhiteboardNode[], edges: WhiteboardEdge[]): string {
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ nodes: sortedNodes, edges: sortedEdges }, null, 2);
}

/**
 * Spatial viewport culling for 60fps rendering on 1k+ object boards.
 */
export function getVisibleNodes(
  nodes: WhiteboardNode[],
  viewport: ViewportState,
  width: number,
  height: number,
): WhiteboardNode[] {
  const minX = -viewport.x / viewport.zoom;
  const minY = -viewport.y / viewport.zoom;
  const maxX = minX + width / viewport.zoom;
  const maxY = minY + height / viewport.zoom;

  return nodes.filter(
    (n) => n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY,
  );
}
