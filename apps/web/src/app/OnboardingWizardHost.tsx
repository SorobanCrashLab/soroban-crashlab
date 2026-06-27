"use client";

import OnboardingWizard from "./components/OnboardingWizard";
import { useOnboardingWizard } from "./hooks/useOnboardingWizard";

export default function OnboardingWizardHost() {
  const { showWizard, markComplete } = useOnboardingWizard();
  return <OnboardingWizard isOpen={showWizard} onClose={markComplete} />;
}
