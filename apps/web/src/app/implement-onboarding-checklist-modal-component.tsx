'use client';

import { useEffect, useMemo, useState } from 'react';

interface OnboardingChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  external?: boolean;
}

const COMPLETED_TASKS_STORAGE_KEY = 'crashlab:onboarding-checklist-completed:v1';

const ONBOARDING_TASKS: OnboardingTask[] = [
  {
    id: 'docs',
    title: 'Read the CrashLab docs',
    description: 'Learn how campaigns, invariants, and issue reports fit together before you start exploring runs.',
    href: 'https://github.com/SorobanCrashLab/soroban-crashlab#readme',
    actionLabel: 'Open docs',
    external: true,
  },
  {
    id: 'examples',
    title: 'Browse example contracts',
    description: 'Review the bundled Soroban contracts and fixtures to see the kinds of inputs CrashLab is built to exercise.',
    href: 'https://github.com/SorobanCrashLab/soroban-crashlab/tree/main/contracts',
    actionLabel: 'View examples',
    external: true,
  },
  {
    id: 'runs',
    title: 'Inspect recent runs',
    description: 'Jump into the dashboard run table to explore reports, expensive runs, and issue details in context.',
    href: '#recent-runs',
    actionLabel: 'Go to run history',
  },
];

function readCompletedTasks(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(COMPLETED_TASKS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeCompletedTasks(taskIds: string[]) {
  try {
    localStorage.setItem(COMPLETED_TASKS_STORAGE_KEY, JSON.stringify(taskIds));
  } catch {
    // ignore storage write errors
  }
}

export default function OnboardingChecklistModal({ isOpen, onClose }: OnboardingChecklistModalProps) {
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCompletedTaskIds(readCompletedTasks());
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCompletedTasks(completedTaskIds);
  }, [completedTaskIds, hydrated]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const completedCount = useMemo(
    () => ONBOARDING_TASKS.filter((task) => completedTaskIds.includes(task.id)).length,
    [completedTaskIds],
  );

  const allTasksComplete = completedCount === ONBOARDING_TASKS.length;
  const progressValue = Math.round((completedCount / ONBOARDING_TASKS.length) * 100);

  const toggleTask = (taskId: string) => {
    setCompletedTaskIds((previous) => (
      previous.includes(taskId)
        ? previous.filter((id) => id !== taskId)
        : [...previous, taskId]
    ));
  };

  const resetChecklist = () => {
    setCompletedTaskIds([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-8 overflow-hidden">
      <div
        className="absolute inset-0 bg-zinc-950/45 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-3xl max-h-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-checklist-title"
        aria-describedby="onboarding-checklist-description"
      >
        <div className="border-b border-zinc-200 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_48%),linear-gradient(135deg,rgba(255,255,255,0.95),rgba(244,244,245,0.92))] px-6 py-6 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_48%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(24,24,27,0.95))] md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                Dashboard Onboarding
              </div>
              <h2 id="onboarding-checklist-title" className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 md:text-3xl">
                Get productive in CrashLab quickly
              </h2>
              <p id="onboarding-checklist-description" className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300 md:text-base">
                Use this checklist to orient yourself on the dashboard, review the core docs, and find the places where issue triage starts.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              aria-label="Close onboarding checklist"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <span>Checklist progress</span>
                <span>{completedCount}/{ONBOARDING_TASKS.length} complete</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {allTasksComplete ? 'Checklist complete' : 'This progress stays in your browser'}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {allTasksComplete
                  ? 'You can reopen this checklist any time from the dashboard.'
                  : 'Dismiss it for now and reopen it later from the dashboard action bar.'}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-6 md:px-8">
          <ul className="space-y-4">
            {ONBOARDING_TASKS.map((task, index) => {
              const isCompleted = completedTaskIds.includes(task.id);

              return (
                <li
                  key={task.id}
                  className={`rounded-3xl border p-5 transition ${isCompleted
                    ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                    : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50'
                    }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border transition ${isCompleted
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-zinc-300 bg-white text-transparent dark:border-zinc-700 dark:bg-zinc-950'
                          }`}
                        aria-pressed={isCompleted}
                        aria-label={`${isCompleted ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>

                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-zinc-900 px-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                            {index + 1}
                          </span>
                          <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{task.title}</h3>
                          {isCompleted && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Complete
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{task.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-none items-center gap-3 md:pl-6">
                      <a
                        href={task.href}
                        target={task.external ? '_blank' : undefined}
                        rel={task.external ? 'noopener noreferrer' : undefined}
                        onClick={() => {
                          if (!task.external) {
                            onClose();
                          }
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-white hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950 dark:hover:text-zinc-50"
                      >
                        {task.actionLabel}
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Dismissing the modal keeps your current progress and leaves the dashboard reopen action available.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetChecklist}
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Reset checklist
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              {allTasksComplete ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}