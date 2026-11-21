// WIP scaffold for issue #2282.

import { TRIAGE_STATES, type TriageState } from "../workflow/stateMachine";

export interface BoardColumn {
  state: TriageState;
  label: string;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = TRIAGE_STATES.map((state) => ({
  state,
  label: state.charAt(0).toUpperCase() + state.slice(1),
}));
