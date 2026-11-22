"use client";

import OnboardingWizard from "./components/OnboardingWizard";
import { useOnboardingWizard } from "./hooks/useOnboardingWizard";
import { useToast } from "../components/Toast";

export default function OnboardingWizardHost() {
  const { notifyError } = useToast();
  const { showWizard, markComplete } = useOnboardingWizard({
    onPersistenceError: (message) => notifyError(message),
  });
  return <OnboardingWizard isOpen={showWizard} onClose={markComplete} />;
}
