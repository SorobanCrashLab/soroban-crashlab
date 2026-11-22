/**
 * Utilities for run contract-call sequence diagrams.
 */

export type SequenceStepStatus = 'ok' | 'error' | 'pending';

export interface SequenceStep {
  id: string;
  order: number;
  caller: string;
  callee: string;
  method: string;
  status: SequenceStepStatus;
  durationMs: number;
  detail?: string;
}

export interface SequenceDiagramFilter {
  status?: SequenceStepStatus | 'all';
  query?: string;
}

export function parseSequenceSteps(raw: unknown): SequenceStep[] {
  if (!Array.isArray(raw)) return [];

  const steps: SequenceStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const order = typeof row.order === 'number' ? row.order : Number(row.order);
    const caller = typeof row.caller === 'string' ? row.caller : '';
    const callee = typeof row.callee === 'string' ? row.callee : '';
    const method = typeof row.method === 'string' ? row.method : '';
    const status = row.status;
    const durationMs =
      typeof row.durationMs === 'number' ? row.durationMs : Number(row.durationMs);
    const detail = typeof row.detail === 'string' ? row.detail : undefined;

    if (
      !id ||
      !Number.isFinite(order) ||
      !caller ||
      !callee ||
      !method ||
      (status !== 'ok' && status !== 'error' && status !== 'pending') ||
      !Number.isFinite(durationMs)
    ) {
      continue;
    }

    steps.push({ id, order, caller, callee, method, status, durationMs, detail });
  }

  return steps.sort((a, b) => a.order - b.order);
}

export function filterSequenceSteps(
  steps: SequenceStep[],
  filter: SequenceDiagramFilter = {},
): SequenceStep[] {
  const status = filter.status ?? 'all';
  const query = (filter.query ?? '').trim().toLowerCase();

  return steps.filter((step) => {
    if (status !== 'all' && step.status !== status) return false;
    if (!query) return true;
    const haystack = `${step.caller} ${step.callee} ${step.method} ${step.detail ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function buildMockSequenceSteps(runId: string): SequenceStep[] {
  const seed = runId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const failAt = seed % 5 === 0 ? 3 : -1;

  const base: Omit<SequenceStep, 'id' | 'status' | 'durationMs'>[] = [
    { order: 1, caller: 'Invoker', callee: 'token', method: 'transfer', detail: 'Validate auth context' },
    { order: 2, caller: 'token', callee: 'auth', method: 'require_auth', detail: 'Caller authorization check' },
    { order: 3, caller: 'token', callee: 'ledger', method: 'get_balance', detail: 'Read sender balance' },
    { order: 4, caller: 'token', callee: 'ledger', method: 'set_balance', detail: 'Write updated balances' },
    { order: 5, caller: 'token', callee: 'events', method: 'publish', detail: 'Emit transfer event' },
  ];

  return base.map((step, index) => {
    const status: SequenceStepStatus =
      failAt === index ? 'error' : index > failAt && failAt >= 0 ? 'pending' : 'ok';
    return {
      ...step,
      id: `${runId}-step-${step.order}`,
      status,
      durationMs: 12 + ((seed + index * 17) % 40),
    };
  });
}
