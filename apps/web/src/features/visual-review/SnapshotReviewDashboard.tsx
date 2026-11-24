/*
 * Visual Snapshot Review Dashboard — #2298
 * Phase 1 scaffold: indexed browser over snapshot runs/suites/changed files.
 * Diff modes (side-by-side/onion-skin/slider/pixel-diff), annotations,
 * classification and baseline governance land in the later phases.
 */

import type { SnapshotRun } from '@/lib/visual-review/ingest';

export default function SnapshotReviewDashboard({ runs }: { runs: SnapshotRun[] }) {
  return (
    <main>
      <h1>Snapshot review</h1>
      <p>{runs.length} indexed run(s)</p>
    </main>
  );
}
