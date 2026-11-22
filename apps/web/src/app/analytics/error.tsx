'use client';

import SegmentError from '../../components/SegmentError';

export default function AnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="analytics" error={error} reset={reset} />;
}
