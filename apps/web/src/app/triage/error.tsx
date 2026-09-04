'use client';

import SegmentError from '../../components/SegmentError';

export default function TriageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="triage" error={error} reset={reset} />;
}
