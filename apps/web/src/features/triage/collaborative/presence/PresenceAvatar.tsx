'use client';

/**
 * Individual avatar with presence status indicator (#2192).
 *
 * Shows user initials in a colored circle with a status dot.
 */

import { memo } from 'react';
import type { PresenceState } from '../yjs/awareness';

interface PresenceAvatarProps {
  presence: PresenceState;
}

const STATUS_COLORS: Record<PresenceState['status'], string> = {
  viewing: 'bg-green-500',
  editing: 'bg-yellow-500',
  away: 'bg-orange-500',
};

const STATUS_LABELS: Record<PresenceState['status'], string> = {
  viewing: 'viewing',
  editing: 'editing tags',
  away: 'away',
};

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function PresenceAvatarBase({ presence }: PresenceAvatarProps) {
  const dotColor = STATUS_COLORS[presence.status] ?? 'bg-gray-400';
  const label = `${presence.userName} (${STATUS_LABELS[presence.status] ?? 'offline'})`;

  return (
    <div
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-white dark:ring-zinc-900"
      style={{ backgroundColor: presence.color }}
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="text-xs font-medium text-white">
        {getInitials(presence.userName)}
      </span>
      <span
        className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${dotColor} rounded-full ring-2 ring-white dark:ring-zinc-900`}
        aria-hidden="true"
      />
    </div>
  );
}

export const PresenceAvatar = memo(PresenceAvatarBase);
