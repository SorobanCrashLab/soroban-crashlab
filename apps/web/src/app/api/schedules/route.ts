import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { CronParseError, addSchedule, createSchedule, validateScheduleName } from '@/lib/cron';
import { getSchedulerState, setSchedulerState } from './_store';

export const GET = withRouteErrorHandling('GET /api/schedules', async () => {
  const { schedules, history } = getSchedulerState();
  return successResponse({ schedules, history });
});

export const POST = withRouteErrorHandling('POST /api/schedules', async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const body = parsedBody.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const cron = typeof body.cron === 'string' ? body.cron : '';
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;

  const state = getSchedulerState();

  const nameError = validateScheduleName(name, state.schedules);
  if (nameError) return jsonError(nameError, 400);

  let schedule;
  try {
    schedule = createSchedule({ name, cron, enabled }, new Date().toISOString(), `sched-${Date.now()}`);
  } catch (error) {
    if (error instanceof CronParseError) return jsonError(error.message, 400);
    throw error;
  }

  setSchedulerState({ ...state, schedules: addSchedule(state.schedules, schedule) });
  return successResponse({ schedule }, { status: 201 });
});
