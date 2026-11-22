"use client";

import { useState } from "react";
import { buildMockRuns } from "@/fixtures";
import {
  generateReproductionSnippet,
  type SnippetLanguage,
} from "../reproduction-snippet-utils";

export default function ReproductionSnippetPage() {
  const failedRuns = buildMockRuns().filter((r) => r.status === "failed");
  const [selectedRunId, setSelectedRunId] = useState<string>(
    failedRuns[0]?.id || "",
  );
  const [language, setLanguage] = useState<SnippetLanguage>("rust");
  const [copied, setCopied] = useState(false);

  const selectedRun = failedRuns.find((r) => r.id === selectedRunId);
  const snippet = selectedRun
    ? generateReproductionSnippet(selectedRun, language)
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">
            Reproduction Snippet Generator
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Generate code snippets to reproduce run failures locally
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
                Configuration
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                  Select Failed Run
                </label>
                <select
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {failedRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id} - {run.crashDetail?.signature.substring(0, 30)}
                      ...
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                  Language
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["rust", "typescript", "bash", "python"] as SnippetLanguage[]).map(
                    (lang) => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-2 text-sm rounded transition-colors ${
                          language === lang
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                        }`}
                      >
                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {selectedRun && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Status:
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      Failed
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Severity:
                    </span>
                    <span className="font-medium">{selectedRun.severity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Area:
                    </span>
                    <span className="font-medium">{selectedRun.area}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Category:
                    </span>
                    <span className="font-medium">
                      {selectedRun.crashDetail?.failureCategory}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Reproduction Snippet ({language})
                </span>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              <div className="p-4 overflow-auto max-h-[600px]">
                <pre className="text-sm text-zinc-900 dark:text-zinc-100 font-mono">
                  <code>{snippet}</code>
                </pre>
              </div>
            </div>

            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2 text-blue-900 dark:text-blue-100">
                💡 How to Use
              </h3>
              <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                <li>Select a failed run from the dropdown</li>
                <li>
                  Choose your preferred language (Rust, TypeScript, Bash, or Python)
                </li>
                <li>Copy the generated snippet</li>
                <li>
                  Run it in your local environment to reproduce the failure
                </li>
                <li>Debug and fix the issue based on the reproduction</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
