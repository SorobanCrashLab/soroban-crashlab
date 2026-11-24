import type { DomainEvent } from '../DomainEvents';
export interface AnalyticsSummary { events: number; runsCreated: number; runsCompleted: number; runsFailed: number; crashes: number; byType: Record<string, number> }
export class AnalyticsProjection {
  private state: AnalyticsSummary = { events: 0, runsCreated: 0, runsCompleted: 0, runsFailed: 0, crashes: 0, byType: {} };
  apply(event: DomainEvent): void {
    this.state.events += 1;
    this.state.byType[event.type] = (this.state.byType[event.type] ?? 0) + 1;
    if (event.type === 'RunCreated') this.state.runsCreated += 1;
    if (event.type === 'RunCompleted') this.state.runsCompleted += 1;
    if (event.type === 'RunFailed') this.state.runsFailed += 1;
    if (event.type === 'CrashDetected') this.state.crashes += 1;
  }
  get(): AnalyticsSummary { return { ...this.state, byType: { ...this.state.byType } }; }
  reset(): void { this.state = { events: 0, runsCreated: 0, runsCompleted: 0, runsFailed: 0, crashes: 0, byType: {} }; }
}
