// WIP scaffold for issue #2278. Per-step validation and progress persistence/resumable
// sessions are not implemented yet.
"use client";

import { useState, type ReactNode } from "react";
import { Stepper } from "./Stepper";

export function Wizard({
  steps,
}: {
  steps: Array<{ label: string; content: ReactNode }>;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="wizard" role="region" aria-label="Multi-step form">
      <Stepper steps={steps.map((step) => step.label)} currentStep={currentStep} />
      <div>{steps[currentStep]?.content}</div>
      <div className="wizard__nav">
        <button type="button" disabled={currentStep === 0} onClick={() => setCurrentStep((s) => s - 1)}>
          Back
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => setCurrentStep((s) => Math.min(s + 1, steps.length - 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
