/*
 * ReviewQueue — #2298
 * Pending snapshot reviews for triage (annotate, classify, approve/reject).
 */

import type { SnapshotReview } from '@/lib/visual-review/governance';

export default function ReviewQueue({ reviews }: { reviews: SnapshotReview[] }) {
  return (
    <ol aria-label="Pending snapshot reviews">
      {reviews.map((r) => (
        <li key={r.id}>
          {r.runId} — {r.classification}
        </li>
      ))}
    </ol>
  );
}
