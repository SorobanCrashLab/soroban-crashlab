"use client";

import { useEffect, useMemo, useState } from "react";
import type { FuzzingRun } from "./types";
import {
  buildCampaignLifecycleEvent,
  buildRunProgressEvent,
  prependCappedEvent,
  selectNextUnseenRun,
  sortRunsForTimeline,
  type MilestoneEvent,
  type MilestoneEventType,
} from "./campaign-milestone-timeline-utils";

type TimelineDataState = "loading" | "error" | "success";

interface CampaignMilestoneTimelineProps {
  runs: FuzzingRun[];
  dataState: TimelineDataState;
  onRetry?: () => void;
  errorMessage?: string;
  campaignId?: string;
  autoUpdateInterval?: number;
  maxEventsDisplayed?: number;
}

export default function CampaignMilestoneTimeline({
  runs,
  dataState,
  onRetry,
  errorMessage,
  campaignId = "campaign-001",
  autoUpdateInterval = 5000,
  maxEventsDisplayed = 10,
}: CampaignMilestoneTimelineProps) {
  const [events, setEvents] = useState<MilestoneEvent[]>([]);
  const [seenRunIds, setSeenRunIds] = useState<string[]>([]);
  const [knownFailureSignatures, setKnownFailureSignatures] = useState<
    string[]
  >([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isLive, setIsLive] = useState(true);

  const sortedRuns = useMemo(() => sortRunsForTimeline(runs), [runs]);

  useEffect(() => {
    setEvents([]);
    setSeenRunIds([]);
    setKnownFailureSignatures([]);
    setIsPaused(false);
    setIsLive(true);
  }, [campaignId]);

  useEffect(() => {
    if (dataState !== "success") {
      return;
    }
    if (events.length > 0) {
      return;
    }

    const campaignStart = buildCampaignLifecycleEvent(
      campaignId,
      "campaign_start",
    );
    setEvents([campaignStart]);
  }, [campaignId, dataState, events.length]);

  useEffect(() => {
    if (dataState !== "success" || isPaused || !isLive) return;

    const interval = setInterval(() => {
      setSeenRunIds((prevSeenRunIds) => {
        const nextRun = selectNextUnseenRun(sortedRuns, prevSeenRunIds);
        if (!nextRun) {
          return prevSeenRunIds;
        }

        setKnownFailureSignatures((prevKnownSignatures) => {
          const signatureSet = new Set(prevKnownSignatures);
          const event = buildRunProgressEvent(nextRun, signatureSet);

          if (event.type === "failure_discovered" && event.failureSignature) {
            signatureSet.add(event.failureSignature);
          }

          setEvents((prevEvents) =>
            prependCappedEvent(prevEvents, event, maxEventsDisplayed),
          );
          return Array.from(signatureSet);
        });

        return [...prevSeenRunIds, nextRun.id];
      });
    }, autoUpdateInterval);

    return () => clearInterval(interval);
  }, [
    autoUpdateInterval,
    dataState,
    isLive,
    isPaused,
    maxEventsDisplayed,
    sortedRuns,
  ]);

  const getSeverityColor = (severity?: string): string => {
    switch (severity) {
      case "critical":
        return "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700";
      case "high":
        return "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700";
      case "medium":
        return "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700";
      case "low":
      default:
        return "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700";
    }
  };

  const getEventIcon = (type: MilestoneEventType): string => {
    switch (type) {
      case "campaign_start":
        return "▶";
      case "campaign_pause":
        return "⏸";
      case "campaign_resume":
        return "▶";
      case "failure_discovered":
        return "⚠";
      case "run_update":
        return "●";
      default:
        return "●";
    }
  };

  const getEventIconBg = (type: MilestoneEventType): string => {
    switch (type) {
      case "campaign_start":
        return "bg-green-600 dark:bg-green-500";
      case "campaign_pause":
        return "bg-yellow-600 dark:bg-yellow-500";
      case "campaign_resume":
        return "bg-green-600 dark:bg-green-500";
      case "failure_discovered":
        return "bg-red-600 dark:bg-red-500";
      case "run_update":
        return "bg-blue-600 dark:bg-blue-500";
      default:
        return "bg-blue-600 dark:bg-blue-500";
    }
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const nextPaused = !prev;
      const marker = buildCampaignLifecycleEvent(
        campaignId,
        nextPaused ? "campaign_pause" : "campaign_resume",
      );
      setEvents((prevEvents) =>
        prependCappedEvent(prevEvents, marker, maxEventsDisplayed),
      );
      return nextPaused;
    });
  };

  if (dataState === "loading") {
    return (
      <section
        className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full font-sans"
        aria-busy="true"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Campaign Milestones</h2>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Connecting timeline stream...
          </span>
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-20 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === "error") {
    return (
      <section className="border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 rounded-xl p-6 shadow-sm w-full font-sans">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">
              Campaign Milestones
            </h2>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {errorMessage ??
                "Timeline stream failed to load. Retry to resync milestone events."}
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry timeline
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full font-sans">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg
            className="w-5 h-5 text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          Campaign Milestones
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleTogglePause}
            aria-pressed={isPaused}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              isPaused
                ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
            }`}
          >
            {isPaused ? "Resume updates" : "Pause updates"}
          </button>
          <button
            type="button"
            onClick={() => setIsLive((prev) => !prev)}
            aria-pressed={isLive}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              isLive
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300"
            }`}
          >
            {isLive ? "Live stream on" : "Live stream off"}
          </button>
        </div>
      </div>

      <div
        className="space-y-3 max-h-96 overflow-y-auto"
        role="log"
        aria-live={isLive && !isPaused ? "polite" : "off"}
        aria-relevant="additions text"
      >
        {events.length === 0 ? (
          <p className="text-center text-zinc-500 dark:text-zinc-400 py-8">
            Waiting for campaign events...
          </p>
        ) : (
          events.map((event, idx) => (
            <div
              key={event.id}
              tabIndex={0}
              className={`border-l-4 rounded-lg p-4 transition-all duration-300 ease-in-out ${getSeverityColor(
                event.severity,
              )} ${idx === 0 ? "opacity-100 shadow-md" : "opacity-90"}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full ${getEventIconBg(
                    event.type,
                  )} text-white flex items-center justify-center font-bold text-sm`}
                >
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {event.label}
                    </h3>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                      {event.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                    {event.description}
                  </p>
                  {event.failureCount !== undefined && (
                    <div className="flex gap-2">
                      <span className="inline-block px-2 py-1 bg-white dark:bg-zinc-900 rounded text-xs font-mono text-zinc-600 dark:text-zinc-300">
                        {event.failureCount} new signature
                        {event.failureCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {events.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            Showing {Math.min(events.length, maxEventsDisplayed)} of{" "}
            {events.length} events
          </span>
          <div className="flex gap-2" aria-live="polite">
            {isPaused && (
              <span className="text-yellow-600 dark:text-yellow-400">
                ⏸ Updates paused
              </span>
            )}
            {isLive && !isPaused && (
              <span className="text-green-600 dark:text-green-400 animate-pulse">
                ● Live updates
              </span>
            )}
            {!isLive && (
              <span className="text-zinc-600 dark:text-zinc-300">
                ● Stream offline
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
