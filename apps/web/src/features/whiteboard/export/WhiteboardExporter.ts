import { serializeBoard, WhiteboardEdge, WhiteboardNode } from '../canvas/CanvasEngine';

export function exportBoardAsMarkdownReport(
  boardId: string,
  nodes: WhiteboardNode[],
  edges: WhiteboardEdge[],
): string {
  const lines = [
    `# Triage Whiteboard Report: ${boardId}`,
    '',
    `## Evidence & Nodes (${nodes.length})`,
    ...nodes.map(
      (n) =>
        `- **${n.title}** (${n.kind})${n.entityRef ? ` [${n.entityRef.type}:${n.entityRef.id}]` : ''}: ${n.content}`,
    ),
    '',
    `## Relationships (${edges.length})`,
    ...edges.map((e) => `- ${e.fromNodeId} -> ${e.toNodeId}${e.label ? ` (${e.label})` : ''}`),
  ];
  return lines.join('\n');
}

export function exportBoardAsJson(nodes: WhiteboardNode[], edges: WhiteboardEdge[]): string {
  return serializeBoard(nodes, edges);
}
