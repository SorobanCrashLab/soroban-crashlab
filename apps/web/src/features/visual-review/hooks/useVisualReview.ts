/*
 * useVisualReview — #2298
 * Fetch indexed runs/reviews and submit review annotations (#041/#061).
 */

import type { SnapshotReview } from '@/lib/visual-review/governance';
import type { SnapshotRun } from '@/lib/visual-review/ingest';

export function useVisualReview() {
  return {
    runs: [] as SnapshotRun[],
    reviews: [] as SnapshotReview[],
    submitReview: async (_review: Omit<SnapshotReview, 'id' | 'createdAt'>) => {
      // POST /api/visual-snapshots/reviews
    },
  };
}
