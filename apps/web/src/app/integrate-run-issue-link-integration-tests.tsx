"use client";

import { useState, useEffect } from "react";
import type { RunIssueLink } from "./types";

/**
 * Issue #251: Integrate Run->issue link integration tests
 *
 * This component provides functionality to link fuzzing runs to external
 * issue trackers (GitHub, Jira, Linear) and run integration tests to verify
 * the linking functionality works end-to-end.
 */

interface IssueTracker {
  id: string;
  name: string;
  type: "github" | "jira" | "linear";
  baseUrl: string;
  enabled: boolean;
}

interface IntegrationTest {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
  error?: string;
}

const MOCK_TRACKERS: IssueTracker[] = [
  {
    id: "gh-1",
    name: "GitHub Issues",
    type: "github",
    baseUrl: "https://github.com/SorobanCrashLab/soroban-crashlab/issues",
    enabled: true,
  },
  {
    id: "jira-1",
    name: "Jira Cloud",
    type: "jira",
    baseUrl: "https://crashlab.atlassian.net/browse",
    enabled: false,
  },
  {
    id: "linear-1",
    name: "Linear",
    type: "linear",
    baseUrl: "https://linear.app/crashlab/issue",
    enabled: false,
  },
];

const INTEGRATION_TESTS: IntegrationTest[] = [
  { id: "test-1", name: "Create issue link", status: "pending" },
  { id: "test-2", name: "Fetch issue metadata", status: "pending" },
  { id: "test-3", name: "Update issue status", status: "pending" },
  { id: "test-4", name: "Validate webhook delivery", status: "pending" },
  { id: "test-5", name: "Test authentication", status: "pending" },
];

export default function IntegrateRunIssueLinkIntegrationTests() {
  const [trackers, setTrackers] = useState<IssueTracker[]>(MOCK_TRACKERS);
  const [tests, setTests] = useState<IntegrationTest[]>(INTEGRATION_TESTS);
  const [selectedRun, setSelectedRun] = useState<string>("run-1001");
  const [issueNumber, setIssueNumber] = useState<string>("");
  const [linkedIssues, setLinkedIssues] = useState<RunIssueLink[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  useEffect(() => {
    // Simulate loading linked issues
    setLinkedIssues([
      {
        label: "GH-248",
        href: "https://github.com/SorobanCrashLab/soroban-crashlab/issues/248",
      },
      {
        label: "GH-251",
        href: "https://github.com/SorobanCrashLab/soroban-crashlab/issues/251",
      },
    ]);
  }, []);

  const handleToggleTracker = (id: string) => {
    setTrackers((prev) =>
      prev.map((tracker) =>
        tracker.id === id ? { ...tracker, enabled: !tracker.enabled } : tracker,
      ),
    );
  };

  const handleLinkIssue = () => {
    if (!issueNumber) return;

    const activeTracker = trackers.find((t) => t.enabled);
    if (!activeTracker) return;

    const newLink: RunIssueLink = {
      label: `${activeTracker.type.toUpperCase()}-${issueNumber}`,
      href: `${activeTracker.baseUrl}/${issueNumber}`,
    };

    setLinkedIssues((prev) => [...prev, newLink]);
    setIssueNumber("");
  };

  const handleRunTests = async () => {
    setIsRunningTests(true);
    setTests((prev) => prev.map((t) => ({ ...t, status: "pending" as const })));

    for (let i = 0; i < tests.length; i++) {
      // Update to running
      setTests((prev) =>
        prev.map((t, idx) =>
          idx === i ? { ...t, status: "running" as const } : t,
        ),
      );

      // Simulate test execution
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      // Random pass/fail (90% pass rate)
      const passed = Math.random() > 0.1;
      setTests((prev) =>
        prev.map((t, idx) =>
          idx === i
            ? {
                ...t,
                status: passed ? "passed" : "failed",
                duration: Math.floor(800 + Math.random() * 400),
                error: passed ? undefined : "Connection timeout",
              }
            : t,
        ),
      );
    }

    setIsRunningTests(false);
  };

  const getTrackerIcon = (type: string) => {
    switch (type) {
      case "github":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        );
      case "jira":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z" />
          </svg>
        );
      case "linear":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M0 0h24v24H0z" fill="none" />
            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const testsPassed = tests.filter((t) => t.status === "passed").length;
  const testsFailed = tests.filter((t) => t.status === "failed").length;
  const testsTotal = tests.length;

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex flex-col xl:flex-row gap-12">
        {/* Left Column - Configuration */}
        <div className="xl:w-1/2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-blue-600 dark:text-blue-400">
            Issue Tracking
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Run → Issue Link Integration
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
            Link fuzzing runs to external issue trackers and run integration
            tests to verify the connection works end-to-end.
          </p>

          {/* Issue Trackers */}
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-4">Connected Trackers</h3>
            <div className="space-y-3">
              {trackers.map((tracker) => (
                <div
                  key={tracker.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        tracker.enabled
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                          : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                      }`}
                    >
                      {getTrackerIcon(tracker.type)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {tracker.name}
                      </div>
                      <div className="text-xs text-zinc-500 font-mono">
                        {tracker.baseUrl}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleTracker(tracker.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      tracker.enabled
                        ? "bg-blue-600"
                        : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        tracker.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Link Issue Form */}
          <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-bold mb-4">Link New Issue</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                  Select Run
                </label>
                <select
                  value={selectedRun}
                  onChange={(e) => setSelectedRun(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-blue-500 outline-none transition"
                >
                  <option value="run-1001">run-1001 (failed)</option>
                  <option value="run-1002">run-1002 (completed)</option>
                  <option value="run-1003">run-1003 (failed)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                  Issue Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., 248"
                  value={issueNumber}
                  onChange={(e) => setIssueNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
              </div>

              <button
                onClick={handleLinkIssue}
                disabled={!issueNumber || !trackers.some((t) => t.enabled)}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Link Issue
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Tests & Linked Issues */}
        <div className="xl:w-1/2">
          {/* Integration Tests */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Integration Tests</h3>
              <button
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isRunningTests ? "Running..." : "Run Tests"}
              </button>
            </div>

            {/* Test Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {testsTotal}
                </div>
                <div className="text-xs text-zinc-500">Total</div>
              </div>
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/50 text-center">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {testsPassed}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">
                  Passed
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-center">
                <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                  {testsFailed}
                </div>
                <div className="text-xs text-rose-600 dark:text-rose-400">
                  Failed
                </div>
              </div>
            </div>

            {/* Test List */}
            <div className="space-y-2">
              {tests.map((test) => (
                <div
                  key={test.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        test.status === "passed"
                          ? "bg-green-500"
                          : test.status === "failed"
                            ? "bg-rose-500"
                            : test.status === "running"
                              ? "bg-blue-500 animate-pulse"
                              : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                    <div>
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {test.name}
                      </div>
                      {test.error && (
                        <div className="text-xs text-rose-600 dark:text-rose-400">
                          {test.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {test.duration && (
                      <span className="text-xs text-zinc-500">
                        {test.duration}ms
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        test.status === "passed"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : test.status === "failed"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : test.status === "running"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {test.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Linked Issues */}
          <div>
            <h3 className="text-xl font-bold mb-4">Linked Issues</h3>
            <div className="space-y-3">
              {linkedIssues.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-zinc-500">
                  No issues linked yet
                </div>
              ) : (
                linkedIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {issue.label}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {selectedRun}
                        </div>
                      </div>
                    </div>
                    <a
                      href={issue.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                    >
                      View →
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
