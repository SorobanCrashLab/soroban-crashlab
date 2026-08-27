import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import {
  CronParseError,
  deleteSchedule,
  updateSchedule,
  validateScheduleName,
  type SchedulePatch,
} from '@/lib/cron';
import { getSchedulerState, setSchedulerState } from '../_store';

export const PUT = withRouteErrorHandling(
  'PUT /api/schedules/[id]',
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
    return successResponse({ schedule: schedules.find((s) => s.id === id) });
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
      schedules: deleteSchedule(state.schedules, id),
      history: state.history.filter((run) => run.scheduleId !== id),
    });
    return successResponse({ deleted: id });
  },
);
