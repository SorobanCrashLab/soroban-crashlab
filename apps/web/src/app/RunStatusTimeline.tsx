"use client";

import React from "react";
import { RunStatus } from "./types";

interface TimelineProps {
  status: RunStatus;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  isLoading?: boolean;
  error?: string | null;
}

function formatDuration(startIso?: string, endIso?: string): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;

  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export default function RunStatusTimeline({
  status,
  queuedAt,
  startedAt,
  finishedAt,
  isLoading = false,
  error = null,
}: TimelineProps) {
  if (error) {
    return (
      <div className="w-full p-6 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-2xl flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-3">
          <svg
            className="w-5 h-5 text-rose-600 dark:text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-base font-bold text-rose-900 dark:text-rose-100">
          Timeline Error
        </h3>
        <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-6 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse">
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mb-8" />
        <div className="flex flex-col md:flex-row justify-between gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex md:flex-col items-center gap-4 flex-1">
              <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <div className="space-y-2 flex-1 md:w-full">
                <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-2 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isRunning = status === "running";
  const isFinalState =
    status === "completed" || status === "failed" || status === "cancelled";

  const finalLabel =
    status === "running"
      ? "Pending"
      : status.charAt(0).toUpperCase() + status.slice(1);

  const steps = [
    {
      id: "queued",
      label: "Queued",
      description: "Run accepted",
      time: queuedAt || "N/A",
      duration: null as string | null,
      isComplete: true,
      isActive: false,
    },
    {
      id: "running",
      label: "Running",
      description: "Fuzzing in progress",
      time: startedAt || "Pending",
      duration: formatDuration(queuedAt, startedAt),
      isComplete: isFinalState,
      isActive: isRunning,
    },
    {
      id: "final",
      label: finalLabel,
      description:
        status === "failed"
          ? "Issues found"
          : status === "cancelled"
            ? "Aborted"
            : "Run finished",
      time: finishedAt || "Pending",
      duration: formatDuration(startedAt, finishedAt),
      isComplete: isFinalState,
      isActive: false,
    },
  ];

  return (
    <section
      className="w-full p-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl transition-all hover:shadow-2xl hover:border-blue-500/30 group"
      aria-label="Execution Timeline"
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          Execution History
        </h2>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-colors ${
            status === "running"
              ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 badge-running"
              : status === "failed"
                ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"
                : status === "completed"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900/30 dark:text-zinc-300 dark:border-zinc-800"
          }`}
        >
          {status === "running" && (
            <span
              className="relative inline-flex h-1.5 w-1.5 shrink-0"
              aria-hidden="true"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
            </span>
          )}
          {status}
        </div>
      </div>

      <div className="relative flex flex-col md:flex-row justify-between w-full px-2">
        {/* Connecting Line (Desktop) */}
        <div
          className="hidden md:block absolute top-6 left-12 right-12 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full"
          aria-hidden="true"
        >
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]"
            style={{
              width:
                status === "completed" ||
                status === "failed" ||
                status === "cancelled"
                  ? "100%"
                  : status === "running"
                    ? "50%"
                    : "0%",
            }}
          />
        </div>

        {/* Connecting Line (Mobile) */}
        <div
          className="md:hidden absolute left-6 top-8 bottom-8 w-1 bg-zinc-100 dark:bg-zinc-900 rounded-full"
          aria-hidden="true"
        >
          <div
            className="w-full bg-blue-600 rounded-full transition-all duration-1000 ease-out"
            style={{
              height:
                status === "completed" ||
                status === "failed" ||
                status === "cancelled"
                  ? "100%"
                  : status === "running"
                    ? "50%"
                    : "0%",
            }}
          />
        </div>

        {steps.map((step) => {
          return (
            <div
              key={step.id}
              className="relative flex md:flex-col items-start md:items-center gap-6 md:gap-4 flex-1 mb-10 md:mb-0 last:mb-0 group/step"
              tabIndex={0}
              role="listitem"
              aria-label={`${step.label}: ${step.description}. ${step.time}${step.duration ? `. Took ${step.duration}` : ""}`}
            >
              <div
                role="tooltip"
                className="pointer-events-none absolute z-20 bottom-full md:bottom-[calc(100%+0.5rem)] left-0 md:left-1/2 md:-translate-x-1/2 mb-2 w-56 max-w-[80vw] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-3 opacity-0 scale-95 origin-bottom transition-all duration-150 group-hover/step:opacity-100 group-hover/step:scale-100 group-focus/step:opacity-100 group-focus/step:scale-100"
              >
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  {step.label}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {step.description}
                </p>
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      Time
                    </span>
                    <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
                      {step.time}
                    </span>
                  </div>
                  {step.duration && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                        Duration
                      </span>
                      <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
                        {step.duration}
                      </span>
                    </div>
                  )}
                </div>
              </div>

                {steps.map((step) => {
                    const isCompleted = step.isComplete;
                    const isActive = step.isActive;
                    const hoverDetail = `${step.label} — ${step.description}. Timestamp: ${step.time}. State: ${
                        isCompleted ? 'complete' : isActive ? 'active' : 'pending'
                    }.`;
                    
                    return (
                        <div 
                            key={step.id} 
                            className="relative flex md:flex-col items-start md:items-center gap-6 md:gap-4 flex-1 mb-10 md:mb-0 last:mb-0 group/step"
                            tabIndex={0}
                            role="listitem"
                            aria-label={`${step.label}: ${step.description}. ${step.time}`}
                            title={hoverDetail}
                        >
                            <div className="relative z-10 shrink-0">
                                {isCompleted ? (
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover/step:scale-110 duration-300 ${
                                        step.id === 'final' && status === 'failed' ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/20' :
                                        step.id === 'final' && status === 'cancelled' ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/20' :
                                        'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-600/20'
                                    }`}>
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            {step.id === 'final' && status === 'failed' ? (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            ) : step.id === 'final' && status === 'cancelled' ? (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                            ) : (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            )}
                                        </svg>
                                    </div>
                                ) : isActive ? (
                                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-blue-600 dark:border-blue-500 flex items-center justify-center shadow-lg shadow-blue-600/10 transition-transform group-hover/step:scale-110 duration-300">
                                        <div className="w-3 h-3 bg-blue-600 dark:bg-blue-500 rounded-full animate-ping" />
                                        <div className="absolute w-3 h-3 bg-blue-600 dark:bg-blue-500 rounded-full" />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-300 dark:text-zinc-700 transition-colors group-hover/step:border-zinc-400 dark:group-hover/step:border-zinc-600">
                                        <div className="w-2 h-2 rounded-full bg-current" />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col md:text-center mt-1 md:mt-0">
                                <span className={`text-sm font-bold tracking-tight transition-colors ${isCompleted || isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600'}`}>
                                    {step.label}
                                </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
                                    {step.description}
                                </span>
                                <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-blue-600/60 dark:text-blue-400/60 mt-3">
                                    {step.time}
                                </span>
                            </div>

                            <div
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 w-56 -translate-x-1/2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-left opacity-0 shadow-xl transition-opacity duration-200 group-hover/step:opacity-100 group-focus-within/step:opacity-100"
                            >
                                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{step.label}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{step.description}</p>
                                <p className="text-[10px] font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 mt-2">{step.time}</p>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                                    {isCompleted ? 'Complete' : isActive ? 'In progress' : 'Pending'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
