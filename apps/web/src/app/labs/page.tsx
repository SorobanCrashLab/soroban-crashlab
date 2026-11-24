'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  learningPathLabs,
  loadLabProgress,
  setLearningPathRole,
  type LabRole,
} from '@/lib/onboarding-labs';
import { LabCard } from '@/components/labs/LabCard';
import { MilestoneTracker } from '@/components/labs/MilestoneTracker';

const ROLES: LabRole[] = ['contributor', 'maintainer', 'security-researcher', 'auditor'];

const ROLE_LABELS: Record<LabRole, string> = {
  contributor: 'Contributor',
  maintainer: 'Maintainer',
  'security-researcher': 'Security Researcher',
  auditor: 'Auditor',
};

export default function LabsPage() {
  const [progress, setProgress] = useState(() => loadLabProgress());
  const [role, setRoleState] = useState<LabRole | null>(progress.role ?? 'contributor');

  useEffect(() => {
    setProgress(loadLabProgress());
  }, []);

  const labs = useMemo(() => learningPathLabs(role), [role]);

  const handleSelectRole = useCallback((next: LabRole) => {
    setRoleState(next);
    setLearningPathRole(next);
  }, []);

  const isAllComplete = labs.length > 0 && labs.every((lab) => progress.completedLabIds.includes(lab.id));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            Guided Labs
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Hands-on fuzzing tutorials with seeded runs, crashes, and traces. No real workspace is touched.
          </p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Learning path</span>
          <div className="flex gap-1.5">
            {ROLES.map((r) => {
              const active = r === role;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSelectRole(r)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              );
            })}
          </div>
        </div>

        <MilestoneTracker progress={progress} labs={labs} role={ROLE_LABELS[role]} />

        <div className="mt-8">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            Labs for {ROLE_LABELS[role]} path
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {labs.map((lab) => (
              <LabCard key={lab.id} lab={lab} progress={progress} />
            ))}
          </div>
        </div>

        {isAllComplete && (
          <div className="mt-8 p-6 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 text-center">
            <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
              🎯 Learning path complete
            </h3>
            <p className="text-green-800 dark:text-green-200 text-sm mb-4">
              Every guided lab in the {ROLE_LABELS[role]} path is finished. You are ready for real campaign triage.
            </p>
            <Link href="/" className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors">
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
