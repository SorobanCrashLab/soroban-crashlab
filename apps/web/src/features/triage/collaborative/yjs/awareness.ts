/**
 * Custom awareness states for presence (#2192).
 *
 * Tracks who is viewing/editing each run, their cursor position, and
 * their activity status. Mocked — uses in-memory state.
 */

export interface PresenceState {
  userId: string;
  userName: string;
  status: 'viewing' | 'editing' | 'away';
  cursor?: { field: string; position: number };
  color: string;
  lastActive: number;
}

type StatesChangeCallback = () => void;

export class AwarenessManager {
  private localState: PresenceState | null = null;
  private remoteStates: Map<string, PresenceState> = new Map();
  private callbacks: Set<StatesChangeCallback> = new Set();
  private awayTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly AWAY_TIMEOUT = 60_000; // 1 min

  setLocalState(state: Partial<PresenceState>): void {
    this.localState = {
      userId: state.userId ?? 'unknown',
      userName: state.userName ?? 'Anonymous',
      status: state.status ?? 'viewing',
      color: state.color ?? '#3b82f6',
      lastActive: Date.now(),
      ...(state.cursor !== undefined ? { cursor: state.cursor } : {}),
    };
    this.notifyStatesChange();
    this.resetAwayTimer();
  }

  getLocalState(): PresenceState | null {
    return this.localState;
  }

  getRemoteStates(): Map<string, PresenceState> {
    return new Map(this.remoteStates);
  }

  setRemoteState(userId: string, state: Partial<PresenceState>): void {
    this.remoteStates.set(userId, {
      userId,
      userName: state.userName ?? 'User',
      status: state.status ?? 'viewing',
      color: state.color ?? '#6b7280',
      lastActive: state.lastActive ?? Date.now(),
      ...(state.cursor !== undefined ? { cursor: state.cursor } : {}),
    });
    this.notifyStatesChange();
  }

  removeRemoteState(userId: string): void {
    this.remoteStates.delete(userId);
    this.notifyStatesChange();
  }

  updateActivity(): void {
    if (this.localState) {
      this.localState.lastActive = Date.now();
      this.localState.status = 'viewing';
    }
    this.resetAwayTimer();
    this.notifyStatesChange();
  }

  markAway(): void {
    if (this.localState) {
      this.localState.status = 'away';
    }
    this.notifyStatesChange();
  }

  onStatesChange(cb: StatesChangeCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private notifyStatesChange(): void {
    this.callbacks.forEach((cb) => cb());
  }

  private resetAwayTimer(): void {
    if (this.awayTimer) clearTimeout(this.awayTimer);
    this.awayTimer = setTimeout(() => this.markAway(), AwarenessManager.AWAY_TIMEOUT);
  }

  destroy(): void {
    if (this.awayTimer) clearTimeout(this.awayTimer);
    this.callbacks.clear();
    this.localState = null;
    this.remoteStates.clear();
  }
}
