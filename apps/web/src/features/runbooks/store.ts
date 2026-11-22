/**
 * In-memory runbook store backing the API routes (#2301). Mirrors the pattern
 * used by `/api/artifacts`; swap for the backend service when available.
 */

import type { RunbookExecution, RunbookRole, RunbookTemplate } from './model';

const SEED: RunbookTemplate[] = [
  {
    id: 'rb-crash-spike',
    title: 'Respond to a crash spike',
    failureType: 'crash_spike',
    service: 'fuzz-runner',
    workspace: 'default',
    version: 1,
    status: 'approved',
    approvedBy: 'maintainer',
    updatedAt: new Date().toISOString(),
    steps: [
      { id: 'collect', title: 'Collect logs and the failing seed', instructions: 'Attach the runner log and the minimized reproducer.', kind: 'manual', requiredEvidence: ['log', 'artifact'], slaMinutes: 15 },
      { id: 'classify', title: 'Is this a regression?', instructions: 'Compare against the last green campaign.', kind: 'decision', options: ['regression', 'flaky', 'environment'] },
      { id: 'pause', title: 'Pause the affected campaign', instructions: 'Stops new seeds from being scheduled.', kind: 'automation', condition: { stepId: 'classify', equals: 'regression' }, automation: { action: 'pause_campaign', requiresApproval: true } },
      { id: 'rerun', title: 'Re-run to confirm flakiness', instructions: '', kind: 'automation', condition: { stepId: 'classify', equals: 'flaky' }, automation: { action: 'rerun', requiresApproval: false } },
      { id: 'issue', title: 'File a tracking issue', instructions: 'Link evidence from the steps above.', kind: 'automation', automation: { action: 'create_issue', requiresApproval: false } },
    ],
  },
];

const templates = new Map<string, RunbookTemplate>(SEED.map((t) => [t.id, t]));
const executions = new Map<string, RunbookExecution>();

export const runbookStore = {
  listTemplates: () => Array.from(templates.values()),
  getTemplate: (id: string) => templates.get(id),
  saveTemplate(t: RunbookTemplate) {
    templates.set(t.id, t);
    return t;
  },
  listExecutions: () => Array.from(executions.values()),
  getExecution: (id: string) => executions.get(id),
  saveExecution(e: RunbookExecution) {
    executions.set(e.id, e);
    return e;
  },
};

/** Identity comes from headers until real auth is wired in; defaults are least-privilege. */
export function identityFromHeaders(headers: Headers): { actor: string; role: RunbookRole } {
  const raw = headers.get('x-crashlab-role');
  const role: RunbookRole = raw === 'maintainer' || raw === 'responder' ? raw : 'viewer';
  return { actor: headers.get('x-crashlab-user') ?? 'anonymous', role };
}
