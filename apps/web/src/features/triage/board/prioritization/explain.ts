// WIP scaffold for issue #2282.

import type { PrioritizationInputs } from "./scoring";

export interface ScoreContribution {
  factor: keyof PrioritizationInputs;
  contribution: number;
}

export function explainScore(inputs: PrioritizationInputs): ScoreContribution[] {
  return [
    { factor: "severityWeight", contribution: inputs.severityWeight * 10 },
    { factor: "frequency", contribution: inputs.frequency * 2 },
    { factor: "novelty", contribution: inputs.novelty * 3 },
    { factor: "customerImpact", contribution: inputs.customerImpact * 5 },
    { factor: "regressionAgeDays", contribution: Math.min(inputs.regressionAgeDays, 30) * 0.5 },
  ];
}
