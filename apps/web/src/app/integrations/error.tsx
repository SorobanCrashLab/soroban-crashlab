'use client';

import SegmentError from '../../components/SegmentError';

export default function IntegrationsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="integrations" error={error} reset={reset} />;
}
