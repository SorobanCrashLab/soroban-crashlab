'use client';

/**
 * Memoized status badge cell for the data grid (#2190).
 *
 * Renders a colored status badge using STATUS_META from the run-status lib.
 */

import { memo } from 'react';
import type { RunStatus } from '@/app/types';
import { STATUS_META } from '@/lib/run-status';

interface StatusBadgeCellProps {
  status: RunStatus;
}

function StatusBadgeCellBase({ status }: StatusBadgeCellProps) {
  const meta = STATUS_META[status];
  if (!meta) return <span className="text-sm">{status}</span>;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border status-badge ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}

export const StatusBadgeCell = memo(StatusBadgeCellBase);
