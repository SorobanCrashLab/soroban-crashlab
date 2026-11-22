import type { DomainEvent } from '../DomainEvents';
import { DashboardProjection } from './DashboardProjection';
import { RunListProjection } from './RunListProjection';
import { AnalyticsProjection } from './AnalyticsProjection';

export class ProjectionManager {
  readonly dashboard = new DashboardProjection();
  readonly runs = new RunListProjection();
  readonly analytics = new AnalyticsProjection();
  apply(event: DomainEvent): void { this.dashboard.apply(event); this.runs.apply(event); this.analytics.apply(event); }
  reset(): void { this.dashboard.reset(); this.runs.reset(); this.analytics.reset(); }
  snapshot() { return { dashboard: this.dashboard.get(), runs: this.runs.list(), analytics: this.analytics.get() }; }
}
let manager: ProjectionManager | undefined;
export function getProjectionManager(): ProjectionManager { return manager ??= new ProjectionManager(); }
export function setProjectionManager(value: ProjectionManager | undefined): void { manager = value; }
