/** Shared timeline controller: one normalised position drives every run. */

import type { CrashMatch, ReplayPosition, ReplaySyncState } from "../types";

export class ReplaySyncController {
  private durations = new Map<string, number>();
  private ratio = 0;
  private playing = false;
  private linkedCrash: CrashMatch | undefined;
  private listeners = new Set<(state: ReplaySyncState) => void>();
  private cachedSnapshot: ReplaySyncState;

  constructor(runIds: string[] = []) {
    for (const runId of runIds) this.durations.set(runId, 0);
    this.cachedSnapshot = this.buildSnapshot();
  }

  subscribe(listener: (state: ReplaySyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setDuration(runId: string, durationMs: number): void {
    this.durations.set(runId, Math.max(0, durationMs));
    this.emit();
  }

  setDurations(durations: Record<string, number>): void {
    for (const [runId, duration] of Object.entries(durations)) this.durations.set(runId, Math.max(0, duration));
    this.emit();
  }

  get maxDurationMs(): number {
    let max = 0;
    for (const duration of this.durations.values()) max = Math.max(max, duration);
    return max;
  }

  seek(ratio: number): void {
    this.ratio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
    this.emit();
  }

  advance(elapsedMs: number): void {
    const duration = this.maxDurationMs;
    if (duration <= 0 || !Number.isFinite(elapsedMs)) return;
    this.seek(this.ratio + elapsedMs / duration);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.emit();
  }

  setLinkedCrash(match: CrashMatch | undefined): void {
    this.linkedCrash = match;
    if (match) {
      const duration = this.durations.get(match.candidate.runId) ?? this.maxDurationMs;
      if (duration > 0) this.seek(match.candidate.timestampMs / duration);
    }
    this.emit();
  }

  snapshot(): ReplaySyncState {
    return this.cachedSnapshot;
  }

  private buildSnapshot(): ReplaySyncState {
    const positions: ReplayPosition[] = [];
    for (const [runId, durationMs] of this.durations) {
      positions.push({
        runId,
        ratio: this.ratio,
        elapsedMs: Math.round(this.ratio * durationMs),
        durationMs,
      });
    }
    return { playing: this.playing, ratio: this.ratio, positions, linkedCrash: this.linkedCrash };
  }

  private emit(): void {
    this.cachedSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener(this.cachedSnapshot);
  }
}
