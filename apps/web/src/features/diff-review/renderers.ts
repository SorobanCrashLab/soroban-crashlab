/*
 * Pluggable diff renderer registry (#1880).
 *
 * The workbench never hard-codes how a diff looks. Each `DiffArtifactKind` maps
 * to one `DiffRenderer`, and `renderArtifact` routes an artifact through the
 * registered renderer. New formats plug in by calling `registerRenderer` with a
 * renderer for their kind; the UI, comments and approvals stay unchanged.
 */

import { DEFAULT_CONTEXT, diffSemantic, diffSnapshot, diffStructured, diffTextLines } from './diff-engine';
import type { ArtifactChange, DiffArtifactKind, DiffRenderer, RenderedDiff } from './types';

const registry = new Map<DiffArtifactKind, DiffRenderer>();

/** Registers (or replaces) the renderer for a kind. */
export function registerRenderer(renderer: DiffRenderer): void {
  registry.set(renderer.kind, renderer);
}

/** All registered renderers, ordered by kind for a stable UI listing. */
export function listRenderers(): DiffRenderer[] {
  return [...registry.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

const textRenderer: DiffRenderer = {
  kind: 'text',
  label: 'Text / unified',
  description: 'Line-based unified diff with context hunks for configs and reports.',
  render({ descriptor, before, after, context }) {
    const result = diffTextLines(before, after, { context });
    return {
      artifactId: descriptor.id,
      kind: 'text',
      rendererLabel: 'Text / unified',
      hunks: result.hunks,
      summary: result.summary,
      isEmpty: result.isEmpty,
      notices: result.notices,
    };
  },
};

const structuredRenderer: DiffRenderer = {
  kind: 'structured',
  label: 'JSON / structured',
  description: 'Leaf-path diff of two JSON documents, grouped by top-level key.',
  render({ descriptor, before, after }) {
    const result = diffStructured(before, after);
    return {
      artifactId: descriptor.id,
      kind: 'structured',
      rendererLabel: 'JSON / structured',
      hunks: result.hunks,
      summary: result.summary,
      isEmpty: result.isEmpty,
      notices: result.notices,
    };
  },
};

const snapshotRenderer: DiffRenderer = {
  kind: 'snapshot',
  label: 'Image / snapshot',
  description: 'Region-level diff of two rendered frames, keyed by region id.',
  render({ descriptor, before, after }) {
    const result = diffSnapshot(before, after);
    return {
      artifactId: descriptor.id,
      kind: 'snapshot',
      rendererLabel: 'Image / snapshot',
      hunks: result.hunks,
      summary: result.summary,
      isEmpty: result.isEmpty,
      notices: result.notices,
    };
  },
};

const semanticRenderer: DiffRenderer = {
  kind: 'semantic',
  label: 'Trace / state',
  description: 'Semantic diff of trace and ledger state, grouped by contract.',
  render({ descriptor, before, after }) {
    const result = diffSemantic(before, after);
    return {
      artifactId: descriptor.id,
      kind: 'semantic',
      rendererLabel: 'Trace / state',
      hunks: result.hunks,
      summary: result.summary,
      isEmpty: result.isEmpty,
      notices: result.notices,
    };
  },
};

registerRenderer(textRenderer);
registerRenderer(structuredRenderer);
registerRenderer(snapshotRenderer);
registerRenderer(semanticRenderer);

/** The renderer that will handle a kind, falling back to the text renderer. */
export function getRenderer(kind: DiffArtifactKind): DiffRenderer {
  return registry.get(kind) ?? textRenderer;
}

/** Routes one artifact through its registered renderer. */
export function renderArtifact(change: ArtifactChange, options: { context?: number } = {}): RenderedDiff {
  const renderer = getRenderer(change.descriptor.kind);
  return renderer.render({
    descriptor: change.descriptor,
    before: change.before,
    after: change.after,
    context: options.context ?? DEFAULT_CONTEXT,
  });
}
