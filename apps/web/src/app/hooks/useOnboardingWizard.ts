/**
 * Hook for managing onboarding wizard state via localStorage.
 */

import { useEffect, useState, useCallback } from 'react';

const WIZARD_COMPLETE_KEY = 'crashlab:onboarding-wizard-complete:v1';

export interface OnboardingWizardState {
  /** Whether the wizard should be shown (first-time user) */
  showWizard: boolean;
  /** Mark the wizard as complete and hide it permanently */
  markComplete: () => void;
  /** Whether the user is a first-time user (wizard not completed) */
  isFirstTime: boolean;
  /** Whether the hook has hydrated from localStorage */
  hydrated: boolean;
}

/**
 * Custom hook for managing onboarding wizard visibility and completion state.
 * 
 * The wizard is shown once for first-time users and can be dismissed permanently.
 * State persists in localStorage across sessions.
 * 
 * @returns Onboarding wizard state and control functions
 */
export function useOnboardingWizard(): OnboardingWizardState {
  const [hydrated, setHydrated] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // Hydrate from localStorage on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(WIZARD_COMPLETE_KEY);
        setIsComplete(stored === 'true');
      } catch {
        // localStorage unavailable — treat as incomplete
        setIsComplete(false);
      }
      setHydrated(true);
    }, 0);
    
    return () => window.clearTimeout(timer);
  }, []);
  
  // Persist completion state to localStorage
  const markComplete = useCallback(() => {
    setIsComplete(true);
    try {
      localStorage.setItem(WIZARD_COMPLETE_KEY, 'true');
    } catch {
      // localStorage unavailable — ignore write error
    }
  }, []);
  
  return {
    showWizard: hydrated && !isComplete,
    markComplete,
    isFirstTime: !isComplete,
    hydrated,
  };
}
