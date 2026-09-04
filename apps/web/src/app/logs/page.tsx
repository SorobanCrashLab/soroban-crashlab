"use client";

/**
 * Log Viewer page – /logs
 * Issue seed #56: Display structured logs from runs with search.
 * Issue #1352: Smart autoscroll with scroll intent tracking.
 *
 * Features: searchable logs, timestamp anchors, loading/error states,
 * keyboard accessibility, responsive layout, smart autoscroll.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import {
  filterLogEntries,
  type LogEntry,
  type LogLevelFilter,
} from "../log-viewer-utils";
import {
  logEntryAnchorId,
  logEntryAnchorHref,
  type PageDataState,
} from "./log-viewer-page-utils";
import { shouldFollow } from "./scroll-intent-utils";
import { useDebounce } from "../../lib/useDebounce";
import { MOCK_LOG_ENTRIES } from "../../fixtures/logs";
import { useDataTableKeyboardNav } from "../use-data-table-keyboard-nav";
import LogSeverityBadge from "../../components/LogSeverityBadge";
import { useRunStream } from "../runs/[id]/useRunStream";

async function fetchLogs(): Promise<LogEntry[]> {
  await new Promise((r) => setTimeout(r, 800));
  return MOCK_LOG_ENTRIES;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LEVEL_OPTIONS: { value: LogLevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "debug", label: "Debug" },
];

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 23) + "Z";
}

import { ListState } from "../../components/ListState";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LogViewerPage() {
  const [dataState, setDataState] = useState<PageDataState>("success");
  const [entries, setEntries] = useState<LogEntry[]>(MOCK_LOG_ENTRIES);
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [fetchAttempt, setFetchAttempt] = useState(0);
  const [autoscroll, setAutoscroll] = useState(true);
  useRunStream("run-1001", (envelope) => {
    if (envelope.event.type !== "LOG_APPEND") return;
    const logEvent = envelope.event;
    setEntries((current) => {
      const known = new Set(current.map((entry) => entry.id));
      return [...current, ...logEvent.entries.filter((entry) => !known.has(entry.id))];
    });
  });

  // Refs for scroll intent tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const distanceFromBottomRef = useRef(0);
  const scrolledUpRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchLogs()
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setDataState("success");
        }
      })
      .catch(() => {
        if (!cancelled) setDataState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAttempt]);

  const handleRetry = () => {
    setDataState("loading");
    setFetchAttempt((n) => n + 1);
  };

  const visible = useMemo(
    () =>
      filterLogEntries(entries, {
        level: levelFilter,
        query: debouncedSearchQuery,
      }).sort((a, b) => a.timestamp - b.timestamp),
    [entries, levelFilter, debouncedSearchQuery],
  );

  const { getRowProps } = useDataTableKeyboardNav({
    rowCount: visible.length,
    onActivate: (index) => {
      const entry = visible[index];
      if (!entry) {
        return;
      }
      const row = document.getElementById(logEntryAnchorId(entry));
      row?.scrollIntoView({ block: "nearest" });
      row?.querySelector<HTMLElement>("a")?.focus();
    },
  });

  // Track scroll position and intent
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;
    let settleTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      distanceFromBottomRef.current = distanceFromBottom;

      // Detect upward scroll
      if (scrollTop < lastScrollTop) {
        scrolledUpRef.current = true;
        // Clear previous settle timeout
        if (settleTimeout) clearTimeout(settleTimeout);
        // Reset scrolledUp flag after 500ms of no scrolling
        settleTimeout = setTimeout(() => {
          if (distanceFromBottom <= 50) {
            scrolledUpRef.current = false;
          }
        }, 500);
      } else if (distanceFromBottom <= 50) {
        // User scrolled down to near-bottom - resume following
        scrolledUpRef.current = false;
      }

      lastScrollTop = scrollTop;
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // Check if clicking on scrollbar area
      if (target === container && e.offsetX > container.clientWidth - 20) {
        isDraggingRef.current = true;
      }
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    container.addEventListener("scroll", handleScroll);
    container.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      if (settleTimeout) clearTimeout(settleTimeout);
    };
  }, []);

  // Autoscroll effect - triggered when visible entries change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || visible.length === 0) return;

    // Decide whether to scroll based on current intent
    const follow = shouldFollow({
      distanceFromBottom: distanceFromBottomRef.current,
      scrolledUp: scrolledUpRef.current || isDraggingRef.current,
      autoscroll,
    });

    if (follow) {
      // Smooth scroll to bottom
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visible, autoscroll]);

  return (
    <div className="container-full page-padding fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Log Viewer</h1>
          <p className="text-meta mt-0.5 sm:mt-1">
            Structured run logs with search and timestamp anchors
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-6">
        {/* Level filter */}
        <div
          role="group"
          aria-label="Filter by log level"
          className="flex flex-wrap gap-2"
        >
          {LEVEL_OPTIONS.map((opt) => {
            const active = levelFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setLevelFilter(opt.value)}
                className={active ? "chip chip-active text-xs" : "chip text-xs"}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <label className="flex-1 min-w-[14rem]">
          <span className="sr-only">Search logs</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search message or source…"
            className="input-field"
          />
        </label>

        {/* Autoscroll toggle */}
        <button
          type="button"
          onClick={() => setAutoscroll(!autoscroll)}
          className={autoscroll ? "chip chip-active text-xs" : "chip text-xs"}
          aria-pressed={autoscroll}
          aria-label="Toggle autoscroll"
        >
          Autoscroll {autoscroll ? "ON" : "OFF"}
        </button>
      </div>

      {/* Content area */}
      <section
        aria-labelledby="log-table-heading"
        className="card overflow-hidden"
      >
        <h2 id="log-table-heading" className="sr-only">
          Log entries
        </h2>

        <ListState
          {...(dataState === "loading"
            ? { state: "loading" }
            : dataState === "error"
              ? {
                  state: "error",
                  message:
                    "Failed to load logs. Check your connection and try again.",
                  onRetry: handleRetry,
                }
              : visible.length === 0
                ? {
                    state: "empty",
                    type: "logs",
                    message: "No log entries match the current filters.",
                    description:
                      levelFilter !== "all" || searchQuery
                        ? "Try clearing search queries or adjusting severity filters to display logs."
                        : "No log records have been generated yet for this session.",
                    action:
                      levelFilter !== "all" || searchQuery ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLevelFilter("all");
                            setSearchQuery("");
                          }}
                          className="btn-outline text-xs sm:text-sm px-3 sm:px-4 py-1.5"
                        >
                          Clear Filters
                        </button>
                      ) : undefined,
                  }
                : { state: "success" })}
        >
          {/* Status bar */}
          <div
            className="px-4 py-2"
            style={{
              background: "var(--bg)",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <span className="text-meta">
              Showing {visible.length} of {entries.length} entries
            </span>
          </div>

          {/* Log table */}
          <div
            ref={scrollContainerRef}
            className="table-responsive"
            style={{ maxHeight: "60vh", overflowY: "auto" }}
          >
            <table
              className="data-table w-full text-xs sm:text-sm font-mono"
              aria-label="Log entries"
            >
              <thead>
                <tr>
                  <th scope="col" className="w-24 sm:w-52">
                    Timestamp
                  </th>
                  <th scope="col" className="w-14 sm:w-20">
                    Level
                  </th>
                  <th scope="col" className="hidden sm:table-cell w-32">
                    Source
                  </th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry, index) => (
                  <tr
                    key={entry.id}
                    id={logEntryAnchorId(entry)}
                    {...getRowProps(index)}
                    aria-label={`Log entry ${entry.level} from ${entry.source}`}
                  >
                    <td className="text-meta whitespace-nowrap text-[10px] sm:text-xs">
                      <a
                        href={logEntryAnchorHref(entry)}
                        className="link text-[10px] sm:text-xs"
                        aria-label={`Anchor for log entry at ${formatTimestamp(entry.timestamp)}`}
                      >
                        {formatTimestamp(entry.timestamp)}
                      </a>
                    </td>
                    <td>
                      <LogSeverityBadge level={entry.level} />
                    </td>
                    <td
                      className="hidden sm:table-cell"
                      style={{ color: "#0A66C2" }}
                    >
                      {entry.source}
                    </td>
                    <td className="break-all text-[11px] sm:text-sm">
                      {entry.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListState>
      </section>
    </div>
  );
}
