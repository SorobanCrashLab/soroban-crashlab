'use client';

import { useEffect, useState } from 'react';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  content: string[];
  icon: string;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CrashLab',
    description: 'Advanced fuzzing and mutation testing for Soroban smart contracts',
    content: [
      'CrashLab helps you discover edge cases and vulnerabilities in Stellar Soroban contracts through intelligent mutation testing.',
      'This quick tour will show you the key features and help you get productive quickly.',
      'You can skip this wizard at any time and reopen it later from the dashboard.'
    ],
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    id: 'runs-reports',
    title: 'Viewing Runs & Reports',
    description: 'Track fuzzing runs and generate actionable reports',
    content: [
      'The Recent Fuzzing Runs table shows all your test executions with status, duration, and resource metrics.',
      'Click any run to see detailed crash information, replay commands, and ledger state changes.',
      'Use the "View Report" action to generate markdown issue templates pre-filled with run data.'
    ],
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    id: 'crashes-replays',
    title: 'Understanding Crashes & Replays',
    description: 'Investigate failures and reproduce them locally',
    content: [
      'When a run fails, CrashLab captures the crash signature, payload, and full execution trace.',
      'Every crash includes a replay command you can copy and run locally to reproduce the exact failure.',
      'Failed runs are highlighted in red with severity badges to help prioritize triage.'
    ],
    icon: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  },
  {
    id: 'templates-tools',
    title: 'Templates & Customization',
    description: 'Create reusable templates and customize your dashboard',
    content: [
      'Build custom Issue and PR templates with markdown support. Templates are saved in your browser and reusable across runs.',
      'Use filters to find specific runs by status, severity, area, or resource usage.',
      'Download run artifacts as zip archives for offline analysis or team sharing.'
    ],
    icon: 'M7 7h10M7 11h10M7 15h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
  },
  {
    id: 'get-started',
    title: 'Get Started',
    description: 'You\'re all set to start fuzzing',
    content: [
      'Configure and launch a new campaign from the dashboard to start fuzzing your contracts.',
      'Browse the run history to see example crashes and understand what CrashLab discovers.',
      'Check the GitHub repository for documentation, sample contracts, and contribution guidelines.'
    ],
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
];

export default function OnboardingWizard({ isOpen, onClose }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Focus trap - simplified version
    const handleTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        // Focus management would go here in production
        // For now, Escape to close is sufficient
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('keydown', handleTab);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('keydown', handleTab);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const step = WIZARD_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const progressPercent = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-8 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/50 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={handleSkip}
      />

      {/* Wizard Modal */}
      <div
        className="relative w-full max-w-3xl max-h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        aria-describedby="wizard-description"
      >
        {/* Header with progress */}
        <div className="border-b border-zinc-200 bg-gradient-to-br from-blue-50 to-indigo-50 px-6 py-6 dark:border-zinc-800 dark:from-blue-950/40 dark:to-indigo-950/40 md:px-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={step?.icon} />
                </svg>
              </div>
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                  <span>Step {currentStep + 1} of {WIZARD_STEPS.length}</span>
                </div>
                <h2 id="wizard-title" className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                  {step?.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              aria-label="Skip wizard"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Progress
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-8 md:px-8 md:py-10">
          <p
            id="wizard-description"
            className="text-lg text-zinc-600 dark:text-zinc-300 mb-6 font-medium"
          >
            {step?.description}
          </p>

          <div className="space-y-4">
            {step?.content.map((paragraph, index) => (
              <p
                key={index}
                className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-400"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {isLastStep && (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center text-white flex-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                    Ready to explore CrashLab
                  </h3>
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    You can reopen this wizard anytime from the dashboard by clicking the &quot;Onboarding checklist&quot; button.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/70 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrevious}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-700 transition hover:bg-white hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950 dark:hover:text-zinc-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Skip wizard
            </button>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold transition hover:from-blue-700 hover:to-indigo-700 shadow-lg"
          >
            {isLastStep ? (
              <>
                Get Started
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            ) : (
              <>
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
