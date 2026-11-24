'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lab, LabSeedRun, LabTraceEvent } from '@/lib/onboarding-labs';

type PlaybackStatus = 'stopped' | 'playing' | 'paused';

const OUTCOME_CLASSES: Record<string, string> = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  crash: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  timeout: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

function outcomeColor(outcome: LabSeedRun['outcome']): string {
  return OUTCOME_CLASSES[outcome] ?? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
}

export interface LabSandboxProps {
  lab: Lab;
  onTriage?: (signature: string) => void;
}

export function LabSandbox({ lab, onTriage }: LabSandboxProps) {
  const crashes = useMemo(() => lab.traces.filter((e) => e.kind === 'crash'), [lab.traces]);
  const [playback, setPlayback] = useState<PlaybackStatus>('stopped');
  const [frame, setFrame] = useState(0);
  const [selectedCrash, setSelectedCrash] = useState<LabTraceEvent | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (playback !== 'playing') return;
    timer.current = setInterval(() => {
      setFrame((i) => {
        if (i >= lab.traces.length - 1) {
          setPlayback('stopped');
          clearTimer();
          return i;
        }
        return i + 1;
      });
    }, 700);
    return clearTimer;
  }, [playback, lab.traces.length, clearTimer]);

  const handlePlay = () => {
    if (playback === 'playing') {
      setPlayback('paused');
      clearTimer();
    } else {
      setPlayback('playing');
      setFrame(0);
    }
  };

  const handleStep = (delta: number) => {
    setPlayback('stopped');
    clearTimer();
    setFrame((i) => Math.min(Math.max(0, i + delta), lab.traces.length - 1));
  };

  const handleSelectCrash = (event: LabTraceEvent) => {
    setSelectedCrash(event);
    if (event.signature && onTriage) onTriage(event.signature);
  };

  return (
    <section className="card card-padding border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Interactive Sandbox</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Seeded runs and traces for {lab.title}. No real workspace is touched.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={handlePlay}
              aria-pressed={playback === 'playing'}
              aria-label={playback === 'playing' ? 'Pause trace playback' : 'Play trace playback'}
              className="px-3 py-1.5 text-xs font-medium border rounded-md transition-colors"
            >
              {playback === 'playing' ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={frame === 0}
              className="px-3 py-1.5 text-xs font-medium border rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              ← Step
            </button>
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={frame >= lab.traces.length - 1}
              className="px-3 py-1.5 text-xs font-medium border rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Step →
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-auto">
              Event {Math.min(frame + 1, lab.traces.length)} of {lab.traces.length}
            </span>
          </div>

          <table className="w-full text-left border-collapse border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Time</th>
                <th className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Kind</th>
                <th className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Message</th>
                <th className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Signature</th>
              </tr>
            </thead>
            <tbody>
              {lab.traces.map((event, index) => {
                const isCurrent = index === frame;
                const isCrash = event.kind === 'crash';
                return (
                  <tr
                    key={index}
                    className={`border-b border-zinc-100 dark:border-zinc-800/30 ${isCurrent ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors'} group`}
                    onClick={() => isCrash ? handleSelectCrash(event) : undefined}
                    role={isCrash ? 'button' : undefined}
                    tabIndex={isCrash ? 0 : undefined}
                    onKeyDown={isCrash ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectCrash(event); } } : undefined}
                    aria-label={`${event.kind}: ${event.message}${event.signature ? ` · ${event.signature}` : ''}`}
                  >
                    <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">{event.t}s</td>
                    <td className="px-3 py-2 text-xs font-semibold">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isCrash ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'}`}
                      >
                        {event.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {event.message}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                      {event.signature ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Seeded Runs</h4>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {lab.seededRuns.map((run) => (
                <div
                  key={run.seed}
                  className="flex items-center justify-between px-3 py-2 text-xs border rounded-md bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-600 dark:text-zinc-400">#{run.seed}</span>
                    {run.outcome === 'crash' && <span className="text-red-600 dark:text-red-400 text-xs">●</span>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${outcomeColor(run.outcome)}`}>
                    {run.outcome}
                  </span>
                  <span className="ml-auto text-zinc-400 dark:text-zinc-500 font-mono">{run.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>

          {crashes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Crash Signatures</h4>
              <div className="space-y-1.5">
                {crashes.map((event) => (
                  <button
                    key={event.t}
                    type="button"
                    onClick={() => handleSelectCrash(event)}
                    className={`w-full text-left px-3 py-2 text-xs border rounded-md transition-colors ${selectedCrash?.t === event.t ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                  >
                    <div className="font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate">
                      {event.signature ?? 'unknown'}
                    </div>
                    <span className="ml-auto text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">
                      {event.severity?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCrash && (
        <div className="mt-5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-600 dark:text-red-400 font-bold text-xs">Crash Inspector</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">t+{selectedCrash.t}s</span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 mb-2">{selectedCrash.message}</p>
          {selectedCrash.signature && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">Signature</span>
              <div className="flex-1 bg-zinc-900 dark:bg-zinc-950 p-2 rounded text-[10px] text-zinc-300 font-mono truncate">
                {selectedCrash.signature}
              </div>
              {onTriage && (
                <button
                  type="button"
                  onClick={() => onTriage(selectedCrash.signature!)}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Confirm Triage
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSelectedCrash(null)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Close inspector
          </button>
        </div>
      )}
    </section>
  );
}
