// WIP scaffold for issue #2278.
"use client";

export function Stepper({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <ol aria-label="Form progress" className="stepper">
      {steps.map((step, index) => (
        <li key={step} aria-current={index === currentStep ? "step" : undefined}>
          {step}
        </li>
      ))}
    </ol>
  );
}
