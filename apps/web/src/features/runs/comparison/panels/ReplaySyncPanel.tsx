"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FuzzingRun } from "@/app/types";
import { useReplaySync } from "../hooks/useReplaySync";
import { correlateCrashes } from "../sync/CrashCorrelator";
import type { CrashCorrelationResult } from "../types";

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const fraction = Math.floor((ms % 1000) / 100);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${fraction}`;
}

export interface ReplaySyncPanelProps {
  baseline: FuzzingRun | null;
  candidates: FuzzingRun[];
  runs: FuzzingRun[];
}

export default function ReplaySyncPanel({ baseline, candidates, runs }: ReplaySyncPanelProps) {
  const runIds = useMemo(() => runs.map((run) => run.id), [runs]);
  const { state, seek, advance, setPlaying, setDurations, setLinkedCrash, maxDurationMs } = useReplaySync(runIds);
  const frameRef = useRef<number | null>(null);

  const durations = useMemo(
    () => Object.fromEntries(runs.map((run) => [run.id, run.duration])),
    [runs],
  );

  useEffect(() => {
    setDurations(durations);
  }, [durations, setDurations]);

  const correlation: CrashCorrelationResult[] = useMemo(
    () => (baseline ? candidates.map((candidate) => correlateCrashes(baseline, candidate)) : []),
    [baseline, candidates],
  );

  useEffect(() => {
    if (!state.playing) return;
    let last = 0;
    const step = (timestamp: number) => {
      if (last > 0) advance(timestamp - last);
      last = timestamp;
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [state.playing, advance]);

  const ratioPercent = Math.round(state.ratio * 100);

  return (
    <section aria-label="Replay synchronization" className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Replay sync</h3>
        <button
          type="button"
          onClick={() => setPlaying(!state.playing)}
          aria-label={state.playing ? "Pause replay" : "Play replay"}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          {state.playing ? "Pause" : "Play"}
        </button>
      </div>

      <label htmlFor="comparison-timeline" className="sr-only">Shared replay position</label>
      <input
        id="comparison-timeline"
        type="range"
        min={0}
        max={1000}
        value={ratioPercent * 10}
        onChange={(event) => seek(Number(event.target.value) / 1000)}
        className="w-full accent-emerald-600"
        aria-valuetext={`${ratioPercent}% — ${formatTime(state.ratio * maxDurationMs)}`}
      />
      <p className="mt-1 text-xs tabular-nums text-zinc-500">
        {formatTime(state.ratio * maxDurationMs)} / {formatTime(maxDurationMs)}
      </p>

      <ul className="mt-3 space-y-2">
        {state.positions.map((position) => {
          const run = runs.find((candidate) => candidate.id === position.runId);
          const runCrashes = correlation.flatMap((result) => [
            ...result.matched.filter((match) => match.candidate.runId === position.runId).map((match) => ({
              id: match.candidate.fingerprint,
              label: match.candidate.signature,
              position: match.candidate.timestampMs,
              match,
            })),
            ...result.newInCandidate
              .filter((crash) => crash.runId === position.runId)
              .map((crash) => ({ id: crash.fingerprint, label: crash.signature, position: crash.timestampMs, match: undefined })),
          ]);
          return (
            <li key={position.runId}>
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-mono">{position.runId}</span>
                <span className="tabular-nums">{formatTime(position.elapsedMs)}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                  style={{ width: `${Math.round(position.ratio * 100)}%` }}
                />
                {runCrashes.map((crash) => (
                  <button
                    key={crash.id}
                    type="button"
                    title={`Crash: ${crash.label}`}
                    aria-label={`Jump to crash on ${position.runId}: ${crash.label}`}
                    onClick={() => {
                      if (crash.match) setLinkedCrash(crash.match);
                      else seek(crash.position / Math.max(1, position.durationMs));
                    }}
                    className="absolute -top-1 h-4 w-1 rounded bg-red-500"
                    style={{ left: `${Math.min(100, (crash.position / Math.max(1, position.durationMs)) * 100)}%` }}
                  />
                ))}
              </div>
              {run?.crashDetail && (
                <p className="mt-1 truncate text-[11px] text-zinc-400">{run.crashDetail.signature}</p>
              )}
            </li>
          );
        })}
      </ul>

      {state.linkedCrash && (
        <p className="mt-3 rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
          Linked crash: <span className="font-mono">{state.linkedCrash.candidate.signature}</span> (
          {state.linkedCrash.kind}, score {state.linkedCrash.score.toFixed(2)})
        </p>
      )}
    </section>
  );
}
