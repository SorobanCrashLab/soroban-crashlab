'use client';

import SegmentError from '../../components/SegmentError';

export default function RunsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="runs" error={error} reset={reset} />;
}
