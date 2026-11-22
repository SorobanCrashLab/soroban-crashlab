'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  achievedMilestones,
  completeLab,
  completeLabStep,
  isLabComplete,
  isStepComplete,
  LABS,
  loadLabProgress,
  MILESTONES,
  type Lab,
  type LabProgress,
} from '@/lib/onboarding-labs';
import { LabSandbox } from '@/components/labs/LabSandbox';
import { MilestoneTracker } from '@/components/labs/MilestoneTracker';

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const AREA_LABELS: Record<string, string> = {
  'rust-engine': 'Rust Engine',
  'fuzz-workflows': 'Fuzz Workflows',
  'frontend-analysis': 'Frontend Analysis',
  triage: 'Triage',
};

export function LabDetailView({ lab }: { lab: Lab }) {
  const [progress, setProgress] = useState<LabProgress>(() =>
    typeof window === 'undefined' ? defaultProgress() : loadLabProgress(),
  );

  useEffect(() => {
    setProgress(loadLabProgress());
  }, []);

  const allStepsComplete = lab.steps.every((step) => isStepComplete(progress, lab.id, step.id));
  const labDone = isLabComplete(progress, lab.id);
  const completedStepCount = lab.steps.filter((step) =>
    isStepComplete(progress, lab.id, step.id),
  ).length;

  const achieved = useMemo(
    () => new Set(achievedMilestones(progress).map((m) => m.id)),
    [progress],
  );

  const nextMilestone = MILESTONES.find((m) => !achieved.has(m.id));

  const handleToggleStep = useCallback(
    (stepId: string) => {
      setProgress(completeLabStep(lab.id, stepId));
    },
    [lab.id],
  );

  const handleCompleteLab = useCallback(() => {
    if (labDone) return;
    setProgress(completeLab(lab.id));
  }, [lab.id, labDone]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/labs"
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Guided Labs
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          {lab.title}
        </h1>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
            {DIFFICULTY_LABELS[lab.difficulty]}
          </span>
          <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
            {AREA_LABELS[lab.area]}
          </span>
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
            {lab.estimatedMinutes} min
          </span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-300 mb-6">{lab.description}</p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <section className="card card-padding border border-zinc-200 dark:border-zinc-800 mb-6">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                Steps
              </h2>
              <div className="space-y-2">
                {lab.steps.map((step, index) => {
                  const done = isStepComplete(progress, lab.id, step.id);
                  return (
                    <div
                      key={step.id}
                      className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${done
                        ? 'bg-green-50 dark:bg-green-950/5 border-green-100 dark:border-green-900/50'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => handleToggleStep(step.id)}
                        aria-label={`Mark step ${index + 1} as complete`}
                        className="mt-1 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            {index + 1}
                          </span>
                          <span className={`text-sm font-semibold ${done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {step.title}
                          </span>
                          {done && (
                            <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {step.instruction}
                        </p>
                        {step.hint && (
                          <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
                            💡 {step.hint}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {lab.steps.length > 0 && !labDone && (
                <button
                  type="button"
                  onClick={handleCompleteLab}
                  disabled={!allStepsComplete}
                  className="mt-4 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {allStepsComplete ? 'Mark Lab Complete' : 'Finish all steps first'}
                </button>
              )}
              {labDone && (
                <div className="mt-4 p-3 rounded-md bg-green-50 dark:bg-green-950/10 border border-green-100 dark:border-green-900/50">
                  <span className="text-xs font-semibold text-green-800 dark:text-green-300">
                    ✓ Lab complete — milestone updated
                  </span>
                </div>
              )}
            </section>

            <LabSandbox lab={lab} />
          </div>

          <div className="lg:col-span-4">
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                Lab Progress
              </h3>
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-500 dark:text-zinc-400">Steps completed</span>
                  <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
                    {completedStepCount} of {lab.steps.length}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${lab.steps.length === 0 ? 100 : Math.round((completedStepCount / lab.steps.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              {nextMilestone && (
                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
                    Next milestone
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {nextMilestone.title}
                  </span>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {nextMilestone.description}
                  </p>
                </div>
              )}
            </div>

            <MilestoneTracker progress={progress} labs={LABS} role={lab.role} />
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultProgress(): LabProgress {
  return {
    role: null,
    completedLabIds: [],
    completedStepIds: [],
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}
