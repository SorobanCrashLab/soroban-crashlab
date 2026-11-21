'use client';

import React from 'react';
import { CollaboratorPresence } from './RealtimeSync';

interface PresenceLayerProps {
  collaborators: CollaboratorPresence[];
}

export function PresenceLayer({ collaborators }: PresenceLayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {collaborators.map((c) => (
        <div
          key={c.userId}
          style={{ transform: `translate(${c.cursorX}px, ${c.cursorY}px)` }}
          className="absolute left-0 top-0 flex items-center gap-1"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: c.color }}
          />
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
