import { WhiteboardNodeKind } from './CanvasEngine';

export interface NodeDefinition {
  kind: WhiteboardNodeKind;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
}

export const NODE_REGISTRY: Record<WhiteboardNodeKind, NodeDefinition> = {
  sticky: { kind: 'sticky', label: 'Sticky Note', defaultWidth: 200, defaultHeight: 140 },
  shape: { kind: 'shape', label: 'Shape', defaultWidth: 160, defaultHeight: 100 },
  frame: { kind: 'frame', label: 'Swimlane / Frame', defaultWidth: 420, defaultHeight: 300 },
  text: { kind: 'text', label: 'Text', defaultWidth: 180, defaultHeight: 60 },
  markdown: { kind: 'markdown', label: 'Markdown Card', defaultWidth: 260, defaultHeight: 180 },
  evidence: { kind: 'evidence', label: 'Evidence Node', defaultWidth: 240, defaultHeight: 130 },
};
