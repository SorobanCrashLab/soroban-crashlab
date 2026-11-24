/**
 * Experiment lifecycle and control-plane rules (#2340).
 *
 *   draft ──submit──▶ pending-approval ──approve×N──▶ approved ──start──▶ running ──▶ completed
 *     ▲                     │  reject                    │                 │  stop      (duration)
 *     └──── save (new version) ◀── rejected               └── abort ───────┴── abort ─▶ aborted
 *                                                                          └── halt rule ─▶ halted
 *
 * Safety rules:
 *  - start needs a passing preflight *at start time* and the experiment name
 *    typed as explicit confirmation; staging/prod starts need a maintainer;
 *  - approvals come from maintainers other than the author, one per person;
 *  - abort is the emergency stop: any analyst, from any non-terminal state,
 *    idempotent (aborting an aborted experiment succeeds without change).
 */

import { preflight, requiredApprovals, type PreflightContext, type PreflightResult } from './guardrails';
import { TERMINAL_STATUSES, type ExperimentRecord, type ExperimentStatus } from './model';
import { evaluateHaltRules, type ChaosTelemetrySource, type TelemetrySample } from './monitor';

export type ChaosRole = 'anonymous' | 'analyst' | 'maintainer';
export type ControlAction = 'submit' | 'approve' | 'reject' | 'start' | 'stop' | 'abort';

export interface Actor {
  subject: string;
  role: ChaosRole;
}

export interface ControlInput {
  action: ControlAction;
  confirmation?: string;
  reason?: string;
  note?: string;
}

export type ControlResult =
  | { ok: true; record: ExperimentRecord; changed: boolean; preflight?: PreflightResult }
  | { ok: false; status: number; error: string; preflight?: PreflightResult };

const fail = (status: number, error: string, extra: { preflight?: PreflightResult } = {}): ControlResult => ({ ok: false, status, error, ...extra });

function withEvent(record: ExperimentRecord, actor: string, action: string, detail: string, at: number, patch: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return { ...record, ...patch, events: [...record.events, { at: new Date(at).toISOString(), actor, action, detail }] };
}

export function needsMaintainerToStart(record: ExperimentRecord): boolean {
  return preflight(record.definition, { now: 0, others: [], approvals: 0 }).impact.environments.some((environment) => environment !== 'dev');
}

export function allowedActions(record: ExperimentRecord, actor: Actor): ControlAction[] {
  if (actor.role === 'anonymous') return [];
  const actions: ControlAction[] = [];
  const maintainer = actor.role === 'maintainer';
  switch (record.status) {
    case 'draft':
    case 'rejected':
      actions.push('submit');
      break;
    case 'pending-approval':
      if (maintainer && record.createdBy !== actor.subject && !record.approvals.some((approval) => approval.by === actor.subject)) actions.push('approve', 'reject');
      break;
    case 'approved':
      if (maintainer || !needsMaintainerToStart(record)) actions.push('start');
      break;
    case 'running':
      actions.push('stop');
      break;
    default:
      break;
  }
  if (!TERMINAL_STATUSES.includes(record.status) && record.status !== 'draft') actions.push('abort');
  return actions;
}

export function applyControl(record: ExperimentRecord, input: ControlInput, actor: Actor, context: Omit<PreflightContext, 'approvals' | 'selfId'>): ControlResult {
  if (actor.role === 'anonymous') return fail(403, 'Sign in to control experiments.');
  const now = context.now;
  const check = () => preflight(record.definition, { ...context, approvals: record.approvals.length, selfId: record.id });

  switch (input.action) {
    case 'submit': {
      if (record.status !== 'draft' && record.status !== 'rejected') return fail(409, `Cannot submit a ${record.status} experiment.`);
      const result = check();
      if (!result.readyToSubmit) return fail(422, 'Preflight checks fail; fix the definition before submitting.', { preflight: result });
      const status: ExperimentStatus = requiredApprovals(record.definition) === 0 ? 'approved' : 'pending-approval';
      return { ok: true, changed: true, preflight: result, record: withEvent(record, actor.subject, 'submit', `Submitted v${record.version} (${status}).`, now, { status, approvals: [] }) };
    }
    case 'approve':
    case 'reject': {
      if (record.status !== 'pending-approval') return fail(409, `Cannot ${input.action} a ${record.status} experiment.`);
      if (actor.role !== 'maintainer') return fail(403, 'Approvals require the maintainer role.');
      if (record.createdBy === actor.subject) return fail(403, 'Authors cannot approve or reject their own experiment.');
      if (input.action === 'reject') {
        return { ok: true, changed: true, record: withEvent(record, actor.subject, 'reject', input.note?.trim() || 'Rejected.', now, { status: 'rejected', approvals: [] }) };
      }
      if (record.approvals.some((approval) => approval.by === actor.subject)) return fail(409, 'You already approved this version.');
      const approvals = [...record.approvals, { by: actor.subject, at: new Date(now).toISOString(), note: input.note?.trim() ?? '' }];
      const status: ExperimentStatus = approvals.length >= requiredApprovals(record.definition) ? 'approved' : 'pending-approval';
      return {
        ok: true,
        changed: true,
        record: withEvent(record, actor.subject, 'approve', `Approval ${approvals.length}/${requiredApprovals(record.definition)}${input.note ? `: ${input.note}` : ''}`, now, { approvals, status }),
      };
    }
    case 'start': {
      if (record.status !== 'approved') return fail(409, `Only approved experiments can start (is ${record.status}).`);
      if (needsMaintainerToStart(record) && actor.role !== 'maintainer') return fail(403, 'Starting staging or production experiments requires the maintainer role.');
      if ((input.confirmation ?? '').trim() !== record.definition.name) {
        return fail(422, `Type the experiment name (“${record.definition.name}”) to confirm.`);
      }
      const result = check();
      if (!result.readyToStart) return fail(422, 'Preflight checks fail at start time.', { preflight: result });
      return {
        ok: true,
        changed: true,
        preflight: result,
        record: withEvent(record, actor.subject, 'start', `Started v${record.version} (${record.definition.durationSec} s).`, now, {
          status: 'running',
          startedAt: new Date(now).toISOString(),
          endedAt: null,
          endReason: null,
          haltedBy: null,
        }),
      };
    }
    case 'stop': {
      if (record.status !== 'running') return fail(409, `Only running experiments can be stopped (is ${record.status}).`);
      return {
        ok: true,
        changed: true,
        record: withEvent(record, actor.subject, 'stop', input.reason?.trim() || 'Stopped early.', now, {
          status: 'completed',
          endedAt: new Date(now).toISOString(),
          endReason: input.reason?.trim() || 'Stopped early by operator.',
        }),
      };
    }
    case 'abort': {
      if (record.status === 'aborted') return { ok: true, changed: false, record };
      if (TERMINAL_STATUSES.includes(record.status) || record.status === 'draft') return fail(409, `Cannot abort a ${record.status} experiment.`);
      const reason = input.reason?.trim();
      if (!reason) return fail(422, 'An abort needs a reason (it is recorded in the audit trail).');
      return {
        ok: true,
        changed: true,
        record: withEvent(record, actor.subject, 'abort', reason, now, {
          status: 'aborted',
          endedAt: record.status === 'running' ? new Date(now).toISOString() : record.endedAt,
          endReason: `Aborted: ${reason}`,
        }),
      };
    }
  }
}

/**
 * Advance a running experiment to `now`: fire halt rules on the telemetry
 * (status → halted) or complete it when its duration has elapsed.
 */
export function advance(
  record: ExperimentRecord,
  telemetry: ChaosTelemetrySource,
  now: number,
): { record: ExperimentRecord; samples: TelemetrySample[]; changed: boolean } {
  if (!record.startedAt) return { record, samples: [], changed: false };
  const started = Date.parse(record.startedAt);
  const ended = record.endedAt ? Date.parse(record.endedAt) : now;
  const elapsed = Math.max(0, Math.min(ended, now) - started);
  const samples = telemetry.samples(record.id, record.definition, elapsed);
  if (record.status !== 'running') return { record, samples, changed: false };

  const halt = evaluateHaltRules(samples, record.definition.haltRules);
  if (halt) {
    const at = started + halt.sample.t;
    return {
      changed: true,
      samples: samples.filter((sample) => sample.t <= halt.sample.t),
      record: withEvent(record, 'system', 'auto-halt', `Halt rule fired at +${Math.round(halt.sample.t / 1_000)} s.`, at, {
        status: 'halted',
        endedAt: new Date(at).toISOString(),
        endReason: 'Automatic halt rule fired.',
        haltedBy: halt.rule,
      }),
    };
  }
  if (elapsed >= record.definition.durationSec * 1_000) {
    const at = started + record.definition.durationSec * 1_000;
    return {
      changed: true,
      samples,
      record: withEvent(record, 'system', 'complete', 'Duration elapsed.', at, { status: 'completed', endedAt: new Date(at).toISOString(), endReason: 'Duration elapsed.' }),
    };
  }
  return { record, samples, changed: false };
}
