'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  loadOnboardingProgress,
  completeStep,
  getProgressPercentage,
  type OnboardingStep,
} from './onboarding-utils';

export default function OnboardingWizardPage() {
  const [steps, setSteps] = useState<OnboardingStep[]>(() => (typeof window === 'undefined' ? [] : loadOnboardingProgress()));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate onboarding progress once
    setSteps(loadOnboardingProgress());
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const currentStep = steps[currentStepIndex];
  const progressPercent = getProgressPercentage(steps);

  const handleCompleteStep = () => {
    const updated = completeStep(currentStep.id);
    setSteps(updated);
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleSkip = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-zinc-50 dark:from-blue-950/20 dark:to-zinc-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              🚀 Getting Started
            </h1>
            <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          {steps.map((step, index) => (
            <button
              key={step.id}
              onClick={() => setCurrentStepIndex(index)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                index === currentStepIndex
                  ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                  : step.completed
                  ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  {index + 1}
                </span>
                {step.completed && (
                  <span className="text-green-600 dark:text-green-400 text-lg">✓</span>
                )}
              </div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                {step.title}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                {step.description}
              </p>
            </button>
          ))}
        </div>

        {currentStep && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 shadow-sm">
            <div className="mb-8">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-4">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                {currentStep.title}
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                {currentStep.description}
              </p>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800 p-6 rounded-lg mb-8">
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {currentStep.content}
              </p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex gap-3">
                {currentStepIndex > 0 && (
                  <button
                    onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
                    className="px-6 py-2 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium transition-colors"
                  >
                    ← Back
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="px-6 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition-colors"
                >
                  Skip
                </button>

                {currentStep.action && (
                  <Link
                    href={currentStep.action.url}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    {currentStep.action.label}
                  </Link>
                )}

                {!currentStep.action && (
                  <button
                    onClick={handleCompleteStep}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    {currentStepIndex === steps.length - 1 ? 'Complete' : 'Next →'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {progressPercent === 100 && (
          <div className="mt-8 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-6 text-center">
            <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
              🎉 Welcome to CrashLab!
            </h3>
            <p className="text-green-800 dark:text-green-200 mb-4">
              You&apos;ve completed the onboarding. Now explore the dashboard and start fuzzing!
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
