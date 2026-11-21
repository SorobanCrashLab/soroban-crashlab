// WIP scaffold for issue #2282. Scoring weights are placeholders pending product input.

export interface PrioritizationInputs {
  severityWeight: number;
  frequency: number;
  novelty: number;
  customerImpact: number;
  regressionAgeDays: number;
}

export function computePriorityScore(inputs: PrioritizationInputs): number {
  return (
    inputs.severityWeight * 10 +
    inputs.frequency * 2 +
    inputs.novelty * 3 +
    inputs.customerImpact * 5 +
    Math.min(inputs.regressionAgeDays, 30) * 0.5
  );
}
