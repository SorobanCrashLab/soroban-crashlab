'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FuzzingRun } from './types';

interface QACheckItem {
  id: string;
  label: string;
  description: string;
  category: 'execution' | 'validation' | 'reporting' | 'security';
}

interface AddRunQAChecklistProps {
  runs?: FuzzingRun[];
}

const QA_CHECKLIST_ITEMS: QACheckItem[] = [
  {
    id: 'run-completed',
    label: 'Run Completed Successfully',
    description: 'Verify that the fuzzing run reached completion without premature termination',
    category: 'execution',
  },
  {
    id: 'seeds-generated',
    label: 'Seeds Generated',
    description: 'Confirm that expected seed count was generated during the run',
    category: 'execution',
  },
  {
    id: 'resource-limits',
    label: 'Resource Limits Within Bounds',
    description: 'Verify CPU instructions, memory usage, and fees are within acceptable ranges',
    category: 'validation',
  },
  {
    id: 'crash-detected',
    label: 'Crashes Properly Detected',
    description: 'Ensure crashes were correctly identified and categorized with proper failure signatures',
    category: 'validation',
  },
  {
    id: 'reproduce-valid',
    label: 'Reproduction Steps Valid',
    description: 'Test that recorded replay actions can successfully reproduce identified crashes',
    category: 'validation',
  },
  {
    id: 'artifacts-collected',
    label: 'Artifacts Collected',
    description: 'Confirm that all relevant logs, payloads, and crash artifacts are available for analysis',
    category: 'reporting',
  },
  {
    id: 'report-generated',
    label: 'Report Generated',
    description: 'Verify that a comprehensive report has been generated with findings and recommendations',
    category: 'reporting',
  },
  {
    id: 'security-reviewed',
    label: 'Security Review Completed',
    description: 'Check that identified vulnerabilities have been reviewed for security implications',
    category: 'security',
  },
  {
    id: 'escalation-flagged',
    label: 'Critical Issues Escalated',
    description: 'Ensure any critical or high-severity issues have been properly escalated',
    category: 'security',
  },
];

const STORAGE_KEY = 'crashlab:run-qa-checklist:v1';

export default function AddRunQAChecklist({ }: AddRunQAChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<'all' | QACheckItem['category']>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setCheckedItems(parsed);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems));
    } catch {
      // localStorage unavailable
    }
  }, [checkedItems]);

  const handleToggleItem = useCallback((id: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = QA_CHECKLIST_ITEMS.map((item) => item.id);
    const allChecked = allIds.every((id) => checkedItems[id]);
    const newState: Record<string, boolean> = {};
    allIds.forEach((id) => {
      newState[id] = !allChecked;
    });
    setCheckedItems(newState);
  }, [checkedItems]);

  const handleClearAll = useCallback(() => {
    setCheckedItems({});
  }, []);

  const filteredItems = useMemo(() => {
    return QA_CHECKLIST_ITEMS.filter(
      (item) => selectedCategory === 'all' || item.category === selectedCategory,
    );
  }, [selectedCategory]);

  const completedCount = useMemo(() => {
    return filteredItems.filter((item) => checkedItems[item.id]).length;
  }, [filteredItems, checkedItems]);

  const totalCount = filteredItems.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getCategoryColor = (category: QACheckItem['category']) => {
    switch (category) {
      case 'execution':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'validation':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'reporting':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
      case 'security':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      default:
        return 'bg-zinc-100 dark:bg-zinc-900/30 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800';
    }
  };

  const getCategoryLabel = (category: QACheckItem['category']) => {
    switch (category) {
      case 'execution':
        return 'Execution';
      case 'validation':
        return 'Validation';
      case 'reporting':
        return 'Reporting';
      case 'security':
        return 'Security';
      default:
        return category;
    }
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-400">
              Quality Assurance
            </p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Run QA Checklist
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
              Systematically verify fuzzing run quality through execution, validation, reporting, and security checks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            aria-label={isExpanded ? 'Collapse checklist' : 'Expand checklist'}
          >
            <svg
              className={`h-6 w-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                    <svg
                      className="h-6 w-6 text-indigo-600 dark:text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Progress: {completedCount} of {totalCount} Complete
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {completionPercentage}% complete
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {completionPercentage}%
                </div>
              </div>
            </div>

            <div className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500 transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Filter by category</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedCategory === 'all'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                All Items
              </button>
              {(['execution', 'validation', 'reporting', 'security'] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${
                    selectedCategory === category
                      ? getCategoryColor(category) + ' ring-2 ring-offset-1 dark:ring-offset-zinc-950'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  {getCategoryLabel(category)}
                  {' '}
                  ({QA_CHECKLIST_ITEMS.filter((i) => i.category === category).length})
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 space-y-3">
            {filteredItems.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={checkedItems[item.id] || false}
                  onChange={() => handleToggleItem(item.id)}
                  className="mt-1 h-5 w-5 flex-shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block text-sm font-medium ${
                        checkedItems[item.id]
                          ? 'text-zinc-400 dark:text-zinc-600 line-through'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`inline-block px-2 py-1 text-xs font-semibold rounded border capitalize ${getCategoryColor(
                        item.category,
                      )}`}
                    >
                      {getCategoryLabel(item.category)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleSelectAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {QA_CHECKLIST_ITEMS.every((item) => checkedItems[item.id]) ? 'Uncheck All' : 'Check All'}
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/50 active:scale-95 transition"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-center border border-blue-200 dark:border-blue-800">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {
                    QA_CHECKLIST_ITEMS.filter((i) => i.category === 'execution' && checkedItems[i.id])
                      .length
                  }
                  /{QA_CHECKLIST_ITEMS.filter((i) => i.category === 'execution').length}
                </div>
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mt-1">Execution</div>
              </div>
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-4 text-center border border-purple-200 dark:border-purple-800">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {
                    QA_CHECKLIST_ITEMS.filter((i) => i.category === 'validation' && checkedItems[i.id])
                      .length
                  }
                  /{QA_CHECKLIST_ITEMS.filter((i) => i.category === 'validation').length}
                </div>
                <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mt-1">
                  Validation
                </div>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-center border border-green-200 dark:border-green-800">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {
                    QA_CHECKLIST_ITEMS.filter((i) => i.category === 'reporting' && checkedItems[i.id])
                      .length
                  }
                  /{QA_CHECKLIST_ITEMS.filter((i) => i.category === 'reporting').length}
                </div>
                <div className="text-xs font-semibold text-green-700 dark:text-green-300 mt-1">Reporting</div>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-center border border-red-200 dark:border-red-800">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {
                    QA_CHECKLIST_ITEMS.filter((i) => i.category === 'security' && checkedItems[i.id])
                      .length
                  }
                  /{QA_CHECKLIST_ITEMS.filter((i) => i.category === 'security').length}
                </div>
                <div className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1">Security</div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
