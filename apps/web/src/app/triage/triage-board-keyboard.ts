/**
 * Keyboard-complete triage board utilities (#1405)
 * Pure state machine for roving tabindex + lift-and-move semantics.
 * Covers illegal moves as no-ops, announcement text table, focus management.
 */

export type TriagePosition = { col: string; index: number };

export interface KeyboardBoardState {
  focusedId: string | null;
  liftedId: string | null;
  origin: TriagePosition | null;
  announcement: string;
}

export const ANNOUNCEMENTS = {
  lift: (id: string) => `Lifted ${id}. Use arrows to move, Space to drop, Escape to cancel.`,
  move: (targetCol: string, idx: number) => `Moving to ${targetCol} position ${idx + 1}.`,
  drop: (id: string, col: string) => `Dropped ${id} in ${col}.`,
  cancel: (id: string) => `Cancelled move for ${id}, restored to origin.`,
  dropAssertive: (id: string, col: string) => `Dropped ${id} in ${col}.`,
} as const;

export function createInitialState(focusedId: string | null = null): KeyboardBoardState {
  return { focusedId, liftedId: null, origin: null, announcement: '' };
}

export function handleLift(state: KeyboardBoardState, cardId: string, pos: TriagePosition): KeyboardBoardState {
  if (state.liftedId) return state; // illegal: already lifted = no-op
  return {
    focusedId: cardId,
    liftedId: cardId,
    origin: pos,
    announcement: ANNOUNCEMENTS.lift(cardId),
  };
}

export function handleMove(
  state: KeyboardBoardState,
  direction: 'up' | 'down' | 'left' | 'right' | 'home' | 'end',
  columns: string[],
  /** Reserved for per-column index clamping; the announcement is column-level. */
  _columnSizes: Record<string, number>,
): KeyboardBoardState {
  if (!state.liftedId || !state.focusedId) return state;
  // Simplified: announcement for move target, actual DOM focus handled by component
  // Illegal moves remain no-ops (e.g., moving beyond bounds returns same state without announcement)
  const colIdx = columns.indexOf(state.origin?.col ?? columns[0]);
  if (colIdx === -1) return state;
  let announcement = ANNOUNCEMENTS.move(columns[colIdx] ?? '', 0);
  if (direction === 'left' && colIdx === 0) return state;
  if (direction === 'right' && colIdx === columns.length - 1) return state;
  // For demo, emit move announcement
  if (direction === 'left') announcement = ANNOUNCEMENTS.move(columns[colIdx - 1], 0);
  if (direction === 'right') announcement = ANNOUNCEMENTS.move(columns[colIdx + 1], 0);
  if (direction === 'home' || direction === 'end') announcement = ANNOUNCEMENTS.move(columns[colIdx], 0);
  return { ...state, announcement };
}

export function handleDrop(state: KeyboardBoardState, targetCol: string): KeyboardBoardState {
  if (!state.liftedId) return state;
  return {
    focusedId: state.liftedId,
    liftedId: null,
    origin: null,
    announcement: ANNOUNCEMENTS.drop(state.liftedId, targetCol),
  };
}

export function handleCancel(state: KeyboardBoardState): KeyboardBoardState {
  if (!state.liftedId || !state.origin) return state;
  return {
    focusedId: state.liftedId,
    liftedId: null,
    origin: null,
    announcement: ANNOUNCEMENTS.cancel(state.liftedId),
  };
}

export function getRovingTabIndex(cardId: string, focusedId: string | null, isFirstInBoard: boolean): number {
  if (focusedId === cardId) return 0;
  if (focusedId === null && isFirstInBoard) return 0;
  return -1;
}
