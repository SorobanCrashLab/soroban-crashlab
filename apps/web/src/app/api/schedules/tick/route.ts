import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { evaluateTick } from '@/lib/cron';
import { getSchedulerState, setSchedulerState } from '../_store';

/**
 * Advances the scheduler clock by one tick (#1422).
 *
 * The mock-mode interval worker on the schedules page POSTs here on a timer.
 * Evaluation is idempotent, so a burst of overlapping ticks is harmless. An
 * optional `{ "now": "<iso>" }` body overrides the clock for demos/tests.
 */
export const POST = withRouteErrorHandling('POST /api/schedules/tick', async (request: NextRequest) => {
  let now = new Date();
  const parsedBody = await readJsonBody(request);
  if (!('error' in parsedBody) && parsedBody.body && typeof parsedBody.body === 'object') {
    const raw = (parsedBody.body as Record<string, unknown>).now;
    if (typeof raw === 'string') {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) now = parsed;
    }
  }

  const state = getSchedulerState();
  const outcome = evaluateTick({ schedules: state.schedules, history: state.history, now });
  setSchedulerState({ schedules: outcome.schedules, history: outcome.history });

  return successResponse({
    created: outcome.created,
    schedules: outcome.schedules,
    history: outcome.history,
    evaluatedAt: now.toISOString(),
  });
});
