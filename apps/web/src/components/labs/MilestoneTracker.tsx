'use client';

import { achievedMilestones, progressPercentage } from '@/lib/onboarding-labs';
import type { Lab, LabProgress } from '@/lib/onboarding-labs';

export interface MilestoneTrackerProps {
  progress: LabProgress;
  labs: Lab[];
  role: string;
}

export function MilestoneTracker({ progress, labs, role }: MilestoneTrackerProps) {
  const milestones = achievedMilestones(progress, labs);
  const percent = progressPercentage(progress, labs);
  const achievedIds = new Set(milestones.map((m) => m.id));

  return (
    <section className="card card-padding border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Success Milestones · {role}</h3>
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{percent}%</span>
      </div>

      <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 mb-6">
        <div
          className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {milestones.map((m) => {
          const achieved = achievedIds.has(m.id);
          return (
            <div
              key={m.id}
              className={`p-3 rounded-md border transition-colors ${achieved
                ? 'bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={achieved ? 'text-green-600 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}>
                  {achieved ? '🏅' : '🔒'}
                </span>
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{m.title}</span>
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {m.description}
              </p>
              {achieved && (
                <span className="mt-1 inline-block text-[10px] font-semibold text-green-600 dark:text-green-400">
                  Achieved
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
