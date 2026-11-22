import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import {
  CronParseError,
  deleteSchedule,
  updateSchedule,
  validateScheduleName,
  type MisfirePolicy,
  type OverlapPolicy,
  type SchedulePatch,
} from '@/lib/cron';
import { isCampaignClass } from '@/lib/capacity/quotas';
import { getSchedulerLedger, getSchedulerState, setSchedulerState } from '../_store';

const MISFIRE_POLICIES: readonly MisfirePolicy[] = ['skip', 'run-immediately'];
const OVERLAP_POLICIES: readonly OverlapPolicy[] = ['skip', 'allow', 'queue'];

function isMisfirePolicy(value: unknown): value is MisfirePolicy {
  return typeof value === 'string' && (MISFIRE_POLICIES as readonly string[]).includes(value);
}

function isOverlapPolicy(value: unknown): value is OverlapPolicy {
  return typeof value === 'string' && (OVERLAP_POLICIES as readonly string[]).includes(value);
}

export const PUT = withRouteErrorHandling(
  'PUT -> /api/schedules/[id]',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const state = getSchedulerState();
    const existing = state.schedules.find((s) => s.id === id);
    if (!existing) return jsonError('Schedule not found.', 404);

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;
    const body = parsedBody.body as Record<string, unknown>;

    const patch: SchedulePatch = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.cron === 'string') patch.cron = body.cron;
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.campaignClass !== undefined) {
      if (!isCampaignClass(body.campaignClass)) {
        return jsonError('campaignClass must be interactive, nightly or deep.', 400);
      }
      patch.campaignClass = body.campaignClass;
    }
    if (body.misfire !== undefined) {
      if (!isMisfirePolicy(body.misfire)) {
        return jsonError('misfire must be skip or run-immediately.', 400);
      }
      patch.misfire = body.misfire;
    }
    if (body.overlap !== undefined) {
      if (!isOverlapPolicy(body.overlap)) {
        return jsonError('overlap must be skip, allow or queue.', 400);
      }
      patch.overlap = body.overlap;
    }
    if (body.catchUpCap !== undefined) {
      if (
        typeof body.catchUpCap !== 'number' ||
        !Number.isInteger(body.catchUpCap) ||
        body.catchUpCap < 0 ||
        body.catchUpCap > 100
      ) {
        return jsonError('catchUpCap must be an integer between 0 and 100.', 400);
      }
      patch.catchUpCap = body.catchUpCap;
    }

    if (patch.name !== undefined) {
      const nameError = validateScheduleName(patch.name, state.schedules, id);
      if (nameError) return jsonError(nameError, 400);
    }

    let schedules;
    try {
      schedules = updateSchedule(state.schedules, id, patch, new Date().toISOString());
    } catch (error) {
      if (error instanceof CronParseError) return jsonError(error.message, 400);
      throw error;
    }

    setSchedulerState({ ...state, schedules });
    const schedule = schedules.find((s) => s.id === id);
    const ledger = getSchedulerLedger(id);
    return successResponse({ schedule, ledger });
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/schedules/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const state = getSchedulerState();
    if (!state.schedules.some((s) => s.id === id)) {
      return jsonError('Schedule not found.', 404);
    }

    setSchedulerState({
      ...state,
      schedules: deleteSchedule(state.schedules, id),
      history: state.history.filter((run) => run.scheduleId !== id),
      ledger: Object.fromEntries(
        Object.entries(state.ledger).filter(([scheduleId]) => scheduleId !== id),
      ),
    });
    return successResponse({ deleted: id });
  },
);
