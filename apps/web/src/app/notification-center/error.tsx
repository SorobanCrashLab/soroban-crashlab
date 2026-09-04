'use client';

import { useEffect, useState } from 'react';
import SegmentError from '../../components/SegmentError';

export default function NotificationCenterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Hydration-fix pattern: the notification center is hydration-sensitive
  // (preferences are only known after mount), so gate the interactive
  // fallback behind a mounted flag to avoid SSR/client mismatch warnings.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate fallback behind mount to avoid SSR/client mismatch
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-8 text-sm text-red-700 dark:text-red-300">
        Loading notifications failed. Retrying…
      </div>
    );
  }

  return <SegmentError family="notification-center" error={error} reset={reset} />;
}
