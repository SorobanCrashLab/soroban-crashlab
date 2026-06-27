"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendReplayHistoryEntry,
  createReplayHistoryEntry,
  filterReplayHistoryBySourceRun,
  formatReplayDuration,
  formatReplayHistoryRelativeTimestamp,
  formatReplayHistoryTimestamp,
  readReplayHistory,
  RUN_REPLAY_HISTORY_STORAGE_KEY,
  type RunReplayHistoryEntry,
  serializeReplayHistory,
  sortReplayHistoryByTimestamp,
} from "./run-replay-history-utils";

interface AddRunReplayHistoryWithTimestampsProps {
  /** When set, only replays sourced from this run are shown. */
  sourceRunId?: string;
  /** Optional heading override for embedded contexts. */
  title?: string;
}

function loadStoredHistory(): RunReplayHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return readReplayHistory(window.localStorage.getItem(RUN_REPLAY_HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persistHistory(entries: RunReplayHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RUN_REPLAY_HISTORY_STORAGE_KEY,
    serializeReplayHistory(entries),
  );
}

export function recordRunReplayHistoryEntry(
  entry: RunReplayHistoryEntry,
): RunReplayHistoryEntry[] {
  const next = appendReplayHistoryEntry(loadStoredHistory(), entry);
  persistHistory(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("crashlab:replay-history-updated"));
  }
  return next;
}

export default function AddRunReplayHistoryWithTimestamps({
  sourceRunId,
  title = "Replay History",
}: AddRunReplayHistoryWithTimestampsProps) {
  const [history, setHistory] = useState<RunReplayHistoryEntry[]>([]);
  const [now, setNow] = useState(() => new Date());

  const refreshHistory = useCallback(() => {
    setHistory(sortReplayHistoryByTimestamp(loadStoredHistory(), "desc"));
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => refreshHistory(), 0);

    const handleUpdate = () => refreshHistory();
    window.addEventListener("crashlab:replay-history-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearTimeout(load);
      window.removeEventListener("crashlab:replay-history-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
      window.clearInterval(interval);
    };
  }, [refreshHistory]);

  const visibleHistory = useMemo(() => {
    const filtered = sourceRunId
      ? filterReplayHistoryBySourceRun(history, sourceRunId)
      : history;
    return sortReplayHistoryByTimestamp(filtered, "desc");
  }, [history, sourceRunId]);

  return (
    <section
      className="card card-padding"
      aria-labelledby="run-replay-history-title"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 id="run-replay-history-title" className="heading-section">
            {title}
          </h2>
          <p className="text-meta mt-1">
            {sourceRunId
              ? `Recent replays triggered from ${sourceRunId}`
              : "Recent seed replays with start and completion timestamps"}
          </p>
        </div>
        <span className="chip text-xs">{visibleHistory.length} entries</span>
      </div>

      {visibleHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-8 text-center">
          <p className="font-medium">No replay history yet</p>
          <p className="text-meta mt-1">
            Trigger a replay from the dashboard or replay UI to populate this timeline.
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Replay Run</th>
                {!sourceRunId && <th>Source Run</th>}
                <th>Started</th>
                <th>Completed</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Link href={`/runs/${entry.replayRunId}`} className="link code-text">
                      {entry.replayRunId}
                    </Link>
                  </td>
                  {!sourceRunId && (
                    <td className="code-text text-meta">{entry.sourceRunId}</td>
                  )}
                  <td>
                    <div className="font-medium">
                      {formatReplayHistoryRelativeTimestamp(entry.startedAt, now)}
                    </div>
                    <div className="text-meta text-xs">
                      {formatReplayHistoryTimestamp(entry.startedAt)}
                    </div>
                  </td>
                  <td>
                    <div className="font-medium">
                      {formatReplayHistoryRelativeTimestamp(entry.completedAt, now)}
                    </div>
                    <div className="text-meta text-xs">
                      {formatReplayHistoryTimestamp(entry.completedAt)}
                    </div>
                  </td>
                  <td className="text-meta">{formatReplayDuration(entry.durationMs)}</td>
                  <td>
                    <span className={`badge badge-${entry.status === "completed" ? "completed" : "failed"}`}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function buildReplayHistoryEntryFromReplay(input: {
  id: string;
  sourceRunId: string;
  replayRunId: string;
  startedAt: string;
  completedAt: string;
  status?: "completed" | "failed";
  seedsReplayed?: number;
  seedsFailed?: number;
}): RunReplayHistoryEntry {
  return createReplayHistoryEntry({
    id: input.id,
    sourceRunId: input.sourceRunId,
    replayRunId: input.replayRunId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: input.status ?? "completed",
    seedsReplayed: input.seedsReplayed,
    seedsFailed: input.seedsFailed,
  });
}
