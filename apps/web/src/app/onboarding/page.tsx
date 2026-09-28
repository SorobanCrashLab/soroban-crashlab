'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const OnboardingChecklistModal = dynamic(
  () => import('../../features/misc/implement-onboarding-checklist-modal-component'),
  { ssr: false },
);

export default function OnboardingPage() {
    const [modalOpen, setModalOpen] = useState(true);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Welcome to Soroban CrashLab</h1>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
                    Follow the onboarding checklist to get productive quickly with smart contract fuzzing.
                </p>
            </div>
            {!modalOpen && (
                <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm transition-all"
                >
                    Open Onboarding Checklist
                </button>
            )}
            <OnboardingChecklistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
        </div>
    );
}
