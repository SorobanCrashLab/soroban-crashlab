'use client';

import type { Lab, LabProgress } from '@/lib/onboarding-labs';
import Link from 'next/link';

export interface LabCardProps {
  lab: Lab;
  progress: LabProgress;
  onStart?: () => void;
}

const DIFFICULTY_CLASSES: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export function LabCard({ lab, progress, onStart }: LabCardProps) {
  const isComplete = progress.completedLabIds.includes(lab.id);
  const labSteps = lab.steps.length;
  const completedSteps = lab.steps.filter((step) =>
    progress.completedStepIds.includes(`${lab.id}:${step.id}`),
  ).length;

  return (
    <article
      className={`card card-padding border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors ${isComplete ? 'bg-green-50 dark:bg-green-950/10' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
            {lab.role}
          </span>
          <span className={`text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400 ${DIFFICULTY_CLASSES[lab.difficulty]}`}>
            {lab.difficulty}
          </span>
        </div>
        {isComplete && (
          <span className="text-green-600 dark:text-green-400 text-xs font-semibold">✓ Complete</span>
        )}
      </div>
      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{lab.title}</h4>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 line-clamp-2">{lab.description}</p>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {completedSteps} of {labSteps} steps · {lab.estimatedMinutes} min
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
          {lab.area}
        </span>
      </div>

      <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 mb-3">
        <div
          className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${labSteps === 0 ? 100 : Math.round((completedSteps / labSteps) * 100)}%` }}
        />
      </div>

      <div className="flex items-center gap-2 pt-3">
        <Link
          href={`/labs/${lab.id}`}
          className="flex-1 px-4 py-2 text-xs font-semibold text-center bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        >
          {isComplete ? 'Review' : 'Start Lab'}
        </Link>
        {onStart && (
          <button
            type="button"
            onClick={onStart}
            className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Details
          </button>
        )}
      </div>
    </article>
  );
}
