'use client';

import { useState } from 'react';
import type { LedgerStateChange } from '../types';

interface ContractStateDiffViewProps {
  changes: LedgerStateChange[];
}

const changeBadge = {
  created: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-900/60',
  updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-900/60',
  deleted: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-900/60',
};

/**
 * Compares two JSON strings and returns a structured diff.
 */
function compareJsonObjects(before: string | undefined, after: string | undefined): {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
  unchanged: Record<string, unknown>;
} {
  const result = {
    added: {} as Record<string, unknown>,
    removed: {} as Record<string, unknown>,
    changed: {} as Record<string, { before: unknown; after: unknown }>,
    unchanged: {} as Record<string, unknown>,
  };

  if (!before && !after) {
    return result;
  }

  try {
    const beforeObj = before ? JSON.parse(before) : {};
    const afterObj = after ? JSON.parse(after) : {};

    const allKeys = new Set([
      ...Object.keys(beforeObj),
      ...Object.keys(afterObj),
    ]);

    for (const key of allKeys) {
      const hasBeforeKey = key in beforeObj;
      const hasAfterKey = key in afterObj;

      if (!hasBeforeKey && hasAfterKey) {
        result.added[key] = afterObj[key];
      } else if (hasBeforeKey && !hasAfterKey) {
        result.removed[key] = beforeObj[key];
      } else if (JSON.stringify(beforeObj[key]) !== JSON.stringify(afterObj[key])) {
        result.changed[key] = {
          before: beforeObj[key],
          after: afterObj[key],
        };
      } else {
        result.unchanged[key] = beforeObj[key];
      }
    }
  } catch {
    // If JSON parsing fails, treat the entire content as changed
  }

  return result;
}

export default function ContractStateDiffView({ changes }: ContractStateDiffViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (changes.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-8 text-center">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-zinc-400 dark:text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          No state changes detected
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          This run did not modify any contract or ledger state
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {changes.map((change) => {
        const isExpanded = expandedIds.has(change.id);
        const diff = compareJsonObjects(change.before, change.after);
        const hasDetails =
          Object.keys(diff.added).length > 0 ||
          Object.keys(diff.removed).length > 0 ||
          Object.keys(diff.changed).length > 0;

        return (
          <article
            key={change.id}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${changeBadge[change.changeType]}`}
                >
                  {change.changeType.toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-0.5">
                  {change.entryType}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {change.id}
                </span>
              </div>

              {hasDetails && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(change.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isExpanded ? (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Hide details
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Show {Object.keys(diff.added).length + Object.keys(diff.removed).length + Object.keys(diff.changed).length} changes
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Before/After comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
                  Before
                </div>
                <pre className="text-xs rounded-lg bg-zinc-100 dark:bg-zinc-950 p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {change.before ?? 'N/A (created)'}
                </pre>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
                  After
                </div>
                <pre className="text-xs rounded-lg bg-zinc-100 dark:bg-zinc-950 p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {change.after ?? 'N/A (deleted)'}
                </pre>
              </div>
            </div>

            {/* Expanded detail view */}
            {isExpanded && hasDetails && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950">
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                  Field-level changes
                </h4>

                {Object.keys(diff.added).length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                      Added fields
                    </div>
                    <div className="space-y-1">
                      {Object.entries(diff.added).map(([key, value]) => (
                        <div
                          key={key}
                          className="text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded px-2 py-1"
                        >
                          <span className="font-mono font-semibold">{key}:</span>{' '}
                          <span className="text-green-700 dark:text-green-300">
                            {JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(diff.removed).length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
                      Removed fields
                    </div>
                    <div className="space-y-1">
                      {Object.entries(diff.removed).map(([key, value]) => (
                        <div
                          key={key}
                          className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded px-2 py-1"
                        >
                          <span className="font-mono font-semibold">{key}:</span>{' '}
                          <span className="text-red-700 dark:text-red-300 line-through">
                            {JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(diff.changed).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Changed fields
                    </div>
                    <div className="space-y-1">
                      {Object.entries(diff.changed).map(([key, { before, after }]) => (
                        <div
                          key={key}
                          className="text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded px-2 py-1"
                        >
                          <span className="font-mono font-semibold">{key}:</span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400 line-through">
                            {JSON.stringify(before)}
                          </span>
                          {' → '}
                          <span className="text-blue-700 dark:text-blue-300">
                            {JSON.stringify(after)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
