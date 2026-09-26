import { NextRequest } from 'next/server';
import { successResponse, errorResponse, status } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { evaluateTick } from '@/lib/cron';
import { getSchedulerState, setSchedulerState } from '../_store';
import { getCronLock, createInMemoryCronLock } from '@/lib/cron/lock';

function verifyCronAuth(request: NextRequest): boolean {
  const CRON_SECRET = process.env.CRASHLAB_CRON_SECRET;
  if (!CRON_SECRET) {
    console.warn('CRASHLAB_CRON_SECRET not set - cron endpoint unprotected');
    return true; // Allow in development if not configured
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(' ');
  if (scheme.toLowerCase() !== 'bearer') return false;

  return token === CRON_SECRET;
}

function generateTickSlotKey(now: Date): string {
  // Generate a slot key based on minute-granularity timestamp
  const minuteSlot = Math.floor(now.getTime() / 60_000);
  return `tick:${minuteSlot}`;
}

export const POST = withRouteErrorHandling(
  'POST /api/schedules/tick',
  async (request: NextRequest) => {
    // 1. Authentication
    if (!verifyCronAuth(request)) {
      return errorResponse('Unauthorized', status.unauthorized);
    }

    // 2. Parse optional time override
    let now = new Date();
    const parsedBody = await readJsonBody(request);
    if (!('error' in parsedBody) && parsedBody.body && typeof parsedBody.body === 'object') {
      const raw = (parsedBody.body as Record<string, unknown>).now;
      if (typeof raw === 'string') {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) now = parsed;
      }
    }

    // 3. Distributed lock to prevent concurrent ticks
    const lock = getCronLock();
    const slotKey = generateTickSlotKey(now);
    const lockAcquired = await lock.acquire(slotKey);

    if (!lockAcquired) {
      return errorResponse('Another tick is in progress', status.conflict);
    }

    try {
      // 4. Idempotency: check if this slot was already processed
      const state = getSchedulerState();
      const slotKeyNormalized = slotKey.replace(':', '_');
      const alreadyProcessed = state.history.some(
        (run) => run.id === `tick-${slotKeyNormalized}` || run.scheduledFor === now.toISOString(),
      );

      if (alreadyProcessed) {
        return successResponse({
          created: [],
          schedules: state.schedules,
          history: state.history,
          evaluatedAt: now.toISOString(),
          idempotent: true,
        });
      }

      // 5. Evaluate tick
      const outcome = evaluateTick({ schedules: state.schedules, history: state.history, now });
      setSchedulerState({ schedules: outcome.schedules, history: outcome.history });

      // 6. Record tick execution for idempotency
      const tickRecord = {
        id: `tick-${slotKeyNormalized}`,
        scheduleId: 'system',
        scheduleName: 'Tick Evaluation',
        cron: '* * * * *',
        scheduledFor: now.toISOString(),
        executedAt: new Date().toISOString(),
        status: 'scheduled' as const,
        tickCount: outcome.created.length,
        caughtUp: false,
        tags: ['system:tick'],
      };

      setSchedulerState({
        schedules: outcome.schedules,
        history: [...outcome.history, tickRecord],
      });

      return successResponse({
        created: outcome.created,
        schedules: outcome.schedules,
        history: outcome.history,
        evaluatedAt: now.toISOString(),
      });
    } finally {
      // 7. Always release lock
      await lock.release(slotKey);
    }
  },
);

// Test helper to reset lock (for testing)
export async function __resetCronLockForTesting(): Promise<void> {
  const inMemoryLock = createInMemoryCronLock();
  // Reset the global lock to in-memory for tests
  const { setCronLock } = await import('@/lib/cron/lock');
  setCronLock(inMemoryLock);
}
