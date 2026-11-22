"use client";

import { useEffect, useState } from 'react';

/** Scrubber + play/pause over topology frames (animated evolution of a window). */
export default function TimelinePlayback({
  timestamps,
  index,
  onIndex,
  intervalMs = 800,
}: {
  timestamps: number[];
  index: number;
  onIndex: (i: number) => void;
  intervalMs?: number;
}) {
  const [playing, setPlaying] = useState(false);
  const last = timestamps.length - 1;

  useEffect(() => {
    if (!playing) return;
    // Respect reduced-motion: step without animation delay changes elsewhere; still advance by user choice.
    const timer = setInterval(() => {
      if (index >= last) setPlaying(false);
      else onIndex(index + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [playing, index, last, intervalMs, onIndex]);

  if (timestamps.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-sm" role="group" aria-label="Time playback">
      <button
        type="button"
        onClick={() => {
          if (!playing && index >= last) onIndex(0);
          setPlaying((p) => !p);
        }}
        className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        aria-label="Time window position"
        aria-valuetext={new Date(timestamps[index]).toLocaleString()}
        onChange={(e) => {
          setPlaying(false);
          onIndex(Number(e.target.value));
        }}
        className="flex-1"
      />
      <time dateTime={new Date(timestamps[index]).toISOString()} className="w-44 text-right font-mono text-xs">
        {new Date(timestamps[index]).toLocaleString()}
      </time>
    </div>
  );
}
