# Collaborative Triage Whiteboard Canvas

The **Triage Whiteboard Canvas** (`/investigations/whiteboard/[id]`) provides a real-time spatial workspace for linking runs, crashes, traces, logs, and RCA hypotheses.

## Architecture

- **Canvas Engine (`CanvasEngine.ts`, `NodeRegistry.ts`, `EdgeRenderer.tsx`, `SelectionManager.ts`)**: Viewport culling, grid snapping, keyboard-accessible nodes, and deterministic serialization.
- **Collaboration (`PresenceLayer.tsx`, `RealtimeSync.ts`, `ConflictResolver.ts`)**: Live cursors and deterministic last-writer-wins conflict resolution.
- **Evidence & Export (`EvidenceNodeCards.tsx`, `WhiteboardExporter.ts`)**: Live-status entity cards and Markdown/JSON report conversion.
