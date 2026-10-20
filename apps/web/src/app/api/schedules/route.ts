import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import {
  CronParseError,
  addSchedule,
  createSchedule,
  validateScheduleName,
  normalizeMisfirePolicy,
  normalizeOverlapPolicy,
} from '@/lib/cron';
import { isCampaignClass } from '@/lib/capacity/quotas';
import { getSchedulerState, setSchedulerState } from './_store';
import { withCsrfGuard } from '@/lib/csrf';

export const GET = withRouteErrorHandling('GET /api/schedules', async () => {
  const { schedules, history, ledger } = getSchedulerState();
  const now = Date.now();
  const enrichedSchedules = schedules.map((schedule) => {
    const entries = ledger.filter((entry) => entry.scheduleId === schedule.id);
    const lastRun = entries.length > 0 ? entries[entries.length - 1] : null;
    const missedCount = entries.filter((entry) => entry.outcome === 'misfire').length;
    return {
      ...schedule,
      lastRun: lastRun ? lastRun.finishedAt ?? lastRun.startedAt ?? lastRun.plannedAt : null,
      nextRun: schedule.enabled ? schedule.nextRun ?? null : null,
      missedCount,
      lastOutcome: lastRun ? lastRun.outcome : null,
      status: deriveStatus(schedule, lastRun, now),
    };
  });
  return successResponse({ schedules: enrichedSchedules, history, ledger });
});

export const POST = withRouteErrorHandling('POST /api/schedules', withCsrfGuard({ authClass: 'session' }, async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const body = parsedBody.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const cron = typeof body.cron === 'string' ? body.cron : '';
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;
  if (body.campaignClass !== undefined && !isCampaignClass(body.campaignClass)) {
    return jsonError('campaignClass must be interactive, nightly or deep.', 400);
  }
  const campaignClass = body.campaignClass;

  const misfirePolicyResult = normalizeMisfirePolicy(body.misfirePolicy);
  if ('error' in misfirePolicyResult) return jsonError(misfirePolicyResult.error, 400);
  const overlapPolicyResult = normalizeOverlapPolicy(body.overlapPolicy);
  if ('error' in overlapPolicyResult) return jsonError(overlapPolicyResult.error, 400);

  const state = getSchedulerState();

  const nameError = validateScheduleName(name, state.schedules);
  if (nameError) return jsonError(nameError, 400);

  let schedule;
  try {
    schedule = createSchedule(
      {
        name,
        cron,
        enabled,
        campaignClass,
        misfirePolicy: misfirePolicyResult.policy,
        misfireCatchUpCap: misfirePolicyResult.catchUpCap,
        overlapPolicy: overlapPolicyResult.policy,
      },
      new Date().toISOString(),
      `sched-${Date.now()}`,
    );
  } catch (error) {
    if (error instanceof CronParseError) return jsonError(error.message, 400);
    throw error;
  }

  setSchedulerState({ ...state, schedules: addSchedule(state.schedules, schedule) });
  return successResponse({ schedule }, { status: 201 });
}));

function deriveStatus(
  schedule: { enabled: boolean; nextRun?: string | null },
  lastRun: { outcome: string } | null,
  now: number,
): 'disabled' | 'ok' | 'running' | 'misfire' | 'overlap-skipped' {
  if (!schedule.enabled) return 'disabled';
  if (!lastRun) {
    return schedule.nextRun && Date.parse(schedule.nextRun) < now ? 'misfire' : 'ok';
  }
  if (lastRun.outcome === 'running') {
    return 'running';
  }
  if (lastRun.outcome === 'misfire') return 'misfire';
  if (lastRun.outcome === 'skipped_overlap') return 'overlap-skipped';
  if (schedule.nextRun && Date.parse(schedule.nextRun) < now) return 'misfire';
  return 'ok';
}