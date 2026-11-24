import type { DomainEvent } from '../DomainEvents';
export interface DashboardSummary { totalRuns: number; running: number; completed: number; failed: number; crashes: number; lastSequence: number }
export class DashboardProjection {
  private readonly state: DashboardSummary = { totalRuns: 0, running: 0, completed: 0, failed: 0, crashes: 0, lastSequence: 0 };
  apply(event: DomainEvent): void {
    if (event.type === 'RunCreated') this.state.totalRuns += 1;
    if (event.type === 'RunStarted') this.state.running += 1;
    if (event.type === 'RunCompleted') { this.state.running = Math.max(0, this.state.running - 1); this.state.completed += 1; }
    if (event.type === 'RunFailed') { this.state.running = Math.max(0, this.state.running - 1); this.state.failed += 1; }
    if (event.type === 'CrashDetected') this.state.crashes += 1;
    this.state.lastSequence = Math.max(this.state.lastSequence, event.sequence);
  }
  get(): DashboardSummary { return { ...this.state }; }
  reset(): void { Object.assign(this.state, { totalRuns: 0, running: 0, completed: 0, failed: 0, crashes: 0, lastSequence: 0 }); }
}
