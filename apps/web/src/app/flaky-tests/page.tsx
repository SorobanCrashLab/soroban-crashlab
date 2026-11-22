"use client";

import { useState } from "react";
import {
  generateFlakyTestData,
  calculateFlakinessScore,
  type FlakyTestDetection,
} from "../flaky-test-detection-utils";

export default function FlakyTestsPage() {
  const [tests] = useState<FlakyTestDetection[]>(() =>
    generateFlakyTestData(15),
  );
  const [sortBy, setSortBy] = useState<"score" | "failures" | "name">("score");

  const sortedTests = [...tests].sort((a, b) => {
    switch (sortBy) {
      case "score":
        return calculateFlakinessScore(b) - calculateFlakinessScore(a);
      case "failures":
        return b.failureCount - a.failureCount;
      case "name":
        return a.testName.localeCompare(b.testName);
      default:
        return 0;
    }
  });

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-red-600 dark:text-red-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return "bg-red-100 dark:bg-red-900/20";
    if (score >= 40) return "bg-yellow-100 dark:bg-yellow-900/20";
    return "bg-green-100 dark:bg-green-900/20";
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">
            Flaky Test Detection
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Monitor test reliability and identify unstable test cases across
            your fuzzing campaigns
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Sort by:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy("score")}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  sortBy === "score"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                }`}
              >
                Flakiness Score
              </button>
              <button
                onClick={() => setSortBy("failures")}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  sortBy === "failures"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                }`}
              >
                Failure Count
              </button>
              <button
                onClick={() => setSortBy("name")}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  sortBy === "name"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                }`}
              >
                Test Name
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {sortedTests.map((test) => {
            const score = calculateFlakinessScore(test);
            const successRate = (
              ((test.totalRuns - test.failureCount) / test.totalRuns) *
              100
            ).toFixed(1);

            return (
              <div
                key={test.id}
                className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate mb-1">
                      {test.testName}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                      {test.signature}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Total:{" "}
                        <span className="font-medium">{test.totalRuns}</span>
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Failures:{" "}
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {test.failureCount}
                        </span>
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Success Rate:{" "}
                        <span className="font-medium">{successRate}%</span>
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Last Seen:{" "}
                        <span className="font-medium">
                          {new Date(test.lastFailure).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div
                      className={`${getScoreBg(score)} px-4 py-2 rounded-lg text-center`}
                    >
                      <div
                        className={`text-2xl font-bold ${getScoreColor(score)}`}
                      >
                        {score}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        Flakiness
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    Trend (last 10 runs)
                  </div>
                  <div className="flex gap-1">
                    {test.trendData.slice(-10).map((passed, idx) => (
                      <div
                        key={idx}
                        className={`h-6 flex-1 rounded ${
                          passed
                            ? "bg-green-500 dark:bg-green-600"
                            : "bg-red-500 dark:bg-red-600"
                        }`}
                        title={passed ? "Passed" : "Failed"}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
