'use client';

/**
 * Presence bar — top bar showing all users viewing the same run (#2192).
 *
 * Shows avatars with status indicators: green (viewing), yellow (editing),
 * orange (away), gray (offline). Accessible with ARIA labels.
 */

import { memo } from 'react';
import { PresenceAvatar } from './PresenceAvatar';
import type { PresenceState } from '../yjs/awareness';

interface PresenceBarProps {
  localState: PresenceState | null;
  remoteStates: Map<string, PresenceState>;
}

function PresenceBarBase({ localState, remoteStates }: PresenceBarProps) {
  const remoteUsers = Array.from(remoteStates.values());
  const allUsers = localState ? [localState, ...remoteUsers] : remoteUsers;

  if (allUsers.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800"
      role="region"
      aria-label="Active collaborators"
    >
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">
        {allUsers.length === 1 ? '1 viewer' : `${allUsers.length} viewers`}
      </span>
      <div className="flex items-center -space-x-2">
        {allUsers.map((user) => (
          <PresenceAvatar key={user.userId} presence={user} />
        ))}
      </div>
    </div>
  );
}

export const PresenceBar = memo(PresenceBarBase);
