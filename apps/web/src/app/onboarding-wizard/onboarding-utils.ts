import { safeStorage } from "../../lib/local-storage";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: string;
  action?: {
    label: string;
    url: string;
  };
  completed: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CrashLab',
    description: 'Get started with smart contract fuzzing',
    content: 'Soroban CrashLab automatically discovers edge cases and vulnerabilities in your contracts through advanced fuzzing.',
    completed: false,
  },
  {
    id: 'deploy',
    title: 'Deploy Your Contract',
    description: 'Upload a Soroban smart contract',
    content: 'Deploy your WASM contract to begin fuzzing. Head to the dashboard to upload or connect to an existing contract.',
    action: {
      label: 'Upload Contract',
      url: '/start',
    },
    completed: false,
  },
  {
    id: 'run-campaign',
    title: 'Start a Fuzzing Campaign',
    description: 'Create your first fuzzing run',
    content: 'Run a mutation-based fuzzing campaign against your contract to discover crashes and edge cases.',
    action: {
      label: 'Start Campaign',
      url: '/start',
    },
    completed: false,
  },
  {
    id: 'review-results',
    title: 'Review Results',
    description: 'Analyze crashes and failures',
    content: 'Examine crash details, failure signatures, and triage results to prioritize fixes.',
    action: {
      label: 'View Runs',
      url: '/runs',
    },
    completed: false,
  },
  {
    id: 'configure-alerts',
    title: 'Set Up Notifications',
    description: 'Configure alerting preferences',
    content: 'Enable notifications for critical crashes and campaign milestones.',
    action: {
      label: 'Configure Alerts',
      url: '/notification-center',
    },
    completed: false,
  },
];

export const loadOnboardingProgress = (): OnboardingStep[] => {
  try {
    const stored = safeStorage.getItem('onboarding-progress');
    if (!stored) return ONBOARDING_STEPS;
    return JSON.parse(stored);
  } catch {
    return ONBOARDING_STEPS;
  }
};

export const saveOnboardingProgress = (steps: OnboardingStep[]): void => {
  try {
    safeStorage.setItem('onboarding-progress', JSON.stringify(steps));
  } catch (e) {
    console.error('Failed to save onboarding progress:', e);
  }
};

export const completeStep = (stepId: string): OnboardingStep[] => {
  const steps = loadOnboardingProgress();
  const updated = steps.map(s => s.id === stepId ? { ...s, completed: true } : s);
  saveOnboardingProgress(updated);
  return updated;
};

export const getProgressPercentage = (steps: OnboardingStep[]): number => {
  const completed = steps.filter(s => s.completed).length;
  return Math.round((completed / steps.length) * 100);
};
