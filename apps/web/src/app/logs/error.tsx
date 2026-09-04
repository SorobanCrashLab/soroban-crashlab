'use client';

import SegmentError from '../../components/SegmentError';

export default function LogsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="logs" error={error} reset={reset} />;
}
