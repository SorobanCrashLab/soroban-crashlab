/*
 * SnapshotDiffViewer — #2298
 * Phase 2 scaffold: diff modes + synchronized zoom/pan.
 * Pixel-diff heatmap, path highlighting and search land in later phases.
 */

import type { DiffConfig } from '@/lib/visual-review/diffConfig';

export default function SnapshotDiffViewer({ config }: { config: DiffConfig }) {
  return (
    <section aria-label="Snapshot diff viewer">
      {config.mode === 'side-by-side' ? <p>Side-by-side view</p> : <p>Onion-skin / slider view</p>}
    </section>
  );
}
