/**
 * Journey analytics (#2341, #078): ordered funnels for the core flows and
 * the most common route paths, computed over replay sessions. Routes are
 * normalized (ids → `:id`) so paths aggregate across entities.
 */

import type { ReplaySession } from '../capture/schema';

export interface FunnelStep {
  label: string;
  /** Route pattern with `:id` placeholders, matched against normalized routes. */
  route?: string;
  /** Matches a click/submit target label. */
  action?: RegExp;
}

export interface FunnelDefinition {
  id: 'triage' | 'campaign-setup' | 'run-investigation';
  name: string;
  steps: FunnelStep[];
}

export const FUNNELS: readonly FunnelDefinition[] = [
  {
    id: 'triage',
    name: 'Triage a crash',
    steps: [
      { label: 'Open triage board', route: '/triage' },
      { label: 'Open a failing run', route: '/runs/:id' },
      { label: 'Assign or file issue', action: /assign|create issue|file issue/i },
    ],
  },
  {
    id: 'campaign-setup',
    name: 'Set up a campaign',
    steps: [
      { label: 'Open campaign designer', route: '/campaigns/new' },
      { label: 'Submit configuration', action: /launch|create campaign|start campaign|submit/i },
      { label: 'View new campaign', route: '/campaigns/:id' },
    ],
  },
  {
    id: 'run-investigation',
    name: 'Investigate a run',
    steps: [
      { label: 'Open runs', route: '/runs' },
      { label: 'Open run detail', route: '/runs/:id' },
      { label: 'Inspect logs or replay', route: '/logs' },
    ],
  },
];

/** Collections whose second path segment is an entity id (`/campaigns/camp-token-fuzz`). */
const COLLECTIONS = new Set(['runs', 'campaigns', 'incidents', 'reports', 'runbooks', 'artifacts', 'replay', 'reproducers', 'investigations', 'contracts']);
const STATIC_SEGMENTS = new Set(['new', 'compare', 'query', 'edit', 'templates', 'history', 'settings']);

export function normalizeRoute(route: string): string {
  const path = route.split('?')[0].split('#')[0] || '/';
  const parts = path.split('/');
  const segments = parts.map((segment, index) => {
    if (index === 2 && COLLECTIONS.has(parts[1]) && segment && !STATIC_SEGMENTS.has(segment)) return ':id';
    // Deeper entity-like segments (`run-1042`, UUIDs, numbers) contain a digit.
    if (index > 1 && /\d/.test(segment)) return ':id';
    return segment;
  });
  return segments.join('/') || '/';
}

interface JourneyStep {
  kind: 'route' | 'action';
  value: string;
}

function journeySteps(session: ReplaySession): JourneyStep[] {
  const steps: JourneyStep[] = [];
  for (const event of [...session.events].sort((a, b) => a.t - b.t)) {
    if (event.type === 'navigation') {
      const route = normalizeRoute(event.route);
      const last = steps[steps.length - 1];
      if (!last || last.kind !== 'route' || last.value !== route) steps.push({ kind: 'route', value: route });
    } else if ((event.type === 'click' || event.type === 'submit') && event.target.label) {
      steps.push({ kind: 'action', value: event.target.label });
    }
  }
  return steps;
}

function matches(step: FunnelStep, journey: JourneyStep): boolean {
  if (step.route) return journey.kind === 'route' && journey.value === step.route;
  return journey.kind === 'action' && Boolean(step.action?.test(journey.value));
}

export interface FunnelResult {
  id: FunnelDefinition['id'];
  name: string;
  steps: Array<{ label: string; sessions: number; conversion: number; dropOff: number }>;
  entered: number;
  completed: number;
}

export function computeFunnel(sessions: readonly ReplaySession[], funnel: FunnelDefinition): FunnelResult {
  const reached = funnel.steps.map(() => 0);
  for (const session of sessions) {
    const journey = journeySteps(session);
    let stepIndex = 0;
    for (const entry of journey) {
      if (stepIndex < funnel.steps.length && matches(funnel.steps[stepIndex], entry)) {
        reached[stepIndex] += 1;
        stepIndex += 1;
      }
    }
  }
  const entered = reached[0] ?? 0;
  return {
    id: funnel.id,
    name: funnel.name,
    entered,
    completed: reached[reached.length - 1] ?? 0,
    steps: funnel.steps.map((step, index) => ({
      label: step.label,
      sessions: reached[index],
      conversion: entered === 0 ? 0 : Math.round((reached[index] / entered) * 1000) / 10,
      dropOff: index === 0 ? 0 : reached[index - 1] - reached[index],
    })),
  };
}

export function topPaths(sessions: readonly ReplaySession[], limit = 5, length = 4): Array<{ path: string[]; sessions: number }> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const routes = journeySteps(session)
      .filter((step) => step.kind === 'route')
      .map((step) => step.value)
      .slice(0, length);
    if (routes.length === 0) continue;
    const key = routes.join(' → ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ path: key.split(' → '), sessions: count }));
}

export function journeyReport(sessions: readonly ReplaySession[]) {
  return { funnels: FUNNELS.map((funnel) => computeFunnel(sessions, funnel)), paths: topPaths(sessions), sessions: sessions.length };
}

export type JourneyReport = ReturnType<typeof journeyReport>;
