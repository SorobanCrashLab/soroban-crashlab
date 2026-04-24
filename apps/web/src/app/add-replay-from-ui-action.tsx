"use client";

import { useEffect, useState } from "react";
import { simulateSeedReplay } from "./replay";
import { getReplayButtonLabel, ReplayButtonStatus } from "./replay-ui-utils";

interface AddReplayFromUiActionProps {
  /** Run ID to replay */
  runId: string;
  /** Callback triggered when the replay simulation starts/completes */
  onReplayInitiated: (newRunData: { id: string; status: "running" }) => void;
}

/**
 * A component that provides a "Replay" button for a specific fuzzing run.
 * It handles the simulation call and manages its own loading state.
 */
export default function AddReplayFromUiAction({
  runId,
  onReplayInitiated,
}: AddReplayFromUiActionProps) {
  const [status, setStatus] = useState<ReplayButtonStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replayedRunId, setReplayedRunId] = useState<string | null>(null);

  const isReplaying = status === "loading";

  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setTimeout(() => {
      setStatus("idle");
      setReplayedRunId(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleReplay = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click from triggering

    if (isReplaying) return;

    setStatus("loading");
    setErrorMessage(null);
    setReplayedRunId(null);
    try {
      const { newRunId } = await simulateSeedReplay(runId);
      onReplayInitiated({ id: newRunId, status: "running" });
      setReplayedRunId(newRunId);
      setStatus("success");
    } catch (error) {
      console.error("Failed to replay run:", error);
      setErrorMessage("Replay could not be started. Press retry to try again.");
      setStatus("error");
    }
  };

  return (
    <div
      className="flex min-w-[10rem] flex-col items-end gap-1"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleReplay}
        disabled={isReplaying}
        aria-busy={isReplaying}
        className={`
                    inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950
                    ${
                      isReplaying
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                        : status === "error"
                          ? "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                          : status === "success"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                            : "bg-blue-50 text-blue-600 hover:scale-105 hover:bg-blue-100 active:scale-95 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    }
                `}
        aria-label={`Replay fuzzing run ${runId}`}
      >
        {isReplaying && (
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isReplaying && (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        )}
        {getReplayButtonLabel(status)}
      </button>
      {status === "success" && replayedRunId && (
        <span
          className="max-w-[14rem] truncate text-right text-[11px] text-emerald-700 dark:text-emerald-300"
          aria-label={`Replay queued as ${replayedRunId}`}
        >
          Queued: {replayedRunId}
        </span>
      )}
      {status === "error" && errorMessage && (
        <span className="max-w-[14rem] text-right text-[11px] text-rose-700 dark:text-rose-300">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
