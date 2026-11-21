# Mermaid & Architecture Diagramming Studio

The **Diagramming Studio** (`/diagrams/[id]`) provides split-pane Mermaid authoring, live sandboxed preview, evidence annotations, and deterministic exports.

## Features

- **Split Editor & Preview (`MermaidEditor.tsx`, `DiagramPreview.tsx`)**: Syntax diagnostics, theme-aware rendering, and accessible fallbacks.
- **Templates (`DiagramTemplates.tsx`)**: Pre-built templates for contract call sequences, failure flows, and state transitions.
- **Evidence Annotations (`AnnotationPanel.tsx`)**: Link diagram nodes to runs, traces, logs, and issues.
- **Versioning & Export (`DiagramExporter.tsx`)**: Snapshot history and Markdown/SVG/PNG/PDF export support.
