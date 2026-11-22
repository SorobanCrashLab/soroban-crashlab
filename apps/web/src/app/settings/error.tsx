'use client';

import SegmentError from '../../components/SegmentError';

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError family="settings" error={error} reset={reset} />;
}
