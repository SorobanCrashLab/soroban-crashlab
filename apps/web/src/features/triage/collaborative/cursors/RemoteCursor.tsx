'use client';

/**
 * Remote cursor indicator (#2192).
 *
 * Renders a cursor showing where a remote user is positioned in
 * the collaborative document, with their name label.
 */

import { memo } from 'react';

export interface RemoteCursorData {
  userId: string;
  userName: string;
  color: string;
  field: string;
  position: number;
}

interface RemoteCursorProps {
  cursor: RemoteCursorData;
}

function RemoteCursorBase({ cursor }: RemoteCursorProps) {
  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        top: 0,
        left: cursor.position,
        height: '1.5em',
      }}
      aria-hidden="true"
    >
      <div
        className="w-0.5 h-full"
        style={{ backgroundColor: cursor.color }}
      />
      <div
        className="absolute top-0 left-0 -translate-y-full px-1.5 py-0.5 text-xs text-white rounded whitespace-nowrap"
        style={{ backgroundColor: cursor.color }}
      >
        {cursor.userName}
      </div>
    </div>
  );
}

export const RemoteCursor = memo(RemoteCursorBase);
