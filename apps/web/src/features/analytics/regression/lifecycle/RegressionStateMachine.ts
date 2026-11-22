/** Regression lifecycle state machine with audit trail (#2207). */

export type RegressionState =
  | 'detected'
  | 'bisecting'
  | 'bisected'
  | 'fixing'
  | 'fixed'
  | 'verified';

export interface AuditEntry {
  from: RegressionState;
  to: RegressionState;
  actor: string;
  at: number;
}

const TRANSITIONS: Record<RegressionState, RegressionState[]> = {
  detected: ['bisecting', 'fixing'],
  bisecting: ['bisected', 'fixing'],
  bisected: ['fixing'],
  fixing: ['fixed'],
  fixed: ['verified', 'fixing'],
  verified: [],
};

export function canTransition(from: RegressionState, to: RegressionState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class RegressionStateMachine {
  private current: RegressionState = 'detected';
  private readonly audit: AuditEntry[] = [];

  constructor(private readonly id: string) {}

  get state(): RegressionState {
    return this.current;
  }

  get history(): AuditEntry[] {
    return [...this.audit];
  }

  transition(to: RegressionState, actor: string, at = Date.now()): RegressionState {
    if (!canTransition(this.current, to)) {
      throw new Error(`Invalid transition ${this.current} -> ${to} for regression ${this.id}`);
    }
    this.audit.push({ from: this.current, to, actor, at });
    this.current = to;
    return this.current;
  }
}
