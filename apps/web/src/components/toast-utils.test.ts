import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOAST_DURATION,
  shouldAutoDismiss,
  createToast,
  addToast,
  removeToast,
  startTimerState,
  pauseTimerState,
  resumeTimerState,
  timerDelay,
  MIN_RESUME_DELAY,
  type Toast,
} from './toast-utils';

describe('toast-utils', () => {
  it('defaults to a duration in the 5-6s window required by #841', () => {
    expect(DEFAULT_TOAST_DURATION).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_TOAST_DURATION).toBeLessThanOrEqual(6000);
  });

  it('createToast applies defaults', () => {
    const t = createToast({ message: 'Request failed', variant: 'error' }, 'id-1');
    expect(t).toEqual({
      id: 'id-1',
      message: 'Request failed',
      variant: 'error',
      duration: DEFAULT_TOAST_DURATION,
    });
  });

  it('lets a caller opt a toast out of auto-dismiss with duration 0 (manual close only)', () => {
    const t = createToast({ message: 'Request failed', variant: 'error' }, 'id-1');
    const sticky = createToast({ message: 'stays', duration: 0 }, 'id-2');
    expect(shouldAutoDismiss(sticky)).toBe(false);
    expect(shouldAutoDismiss(t)).toBe(true);
    expect(shouldAutoDismiss({ duration: -1 })).toBe(false);
    expect(shouldAutoDismiss({ duration: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('defaults variant to "info"', () => {
    expect(createToast({ message: 'hi' }, 'id-3').variant).toBe('info');
  });

  it('add/remove are immutable', () => {
    const t = createToast({ message: 'Request failed', variant: 'error' }, 'id-1');
    const start: Toast[] = [];
    const afterAdd = addToast(start, t);
    expect(start.length).toBe(0);
    expect(afterAdd).toEqual([t]);

    const afterRemove = removeToast(afterAdd, 'id-1');
    expect(afterRemove).toEqual([]);
    // Removing an unknown id is a no-op.
    expect(removeToast(afterAdd, 'nope')).toEqual([t]);
  });

  // ── #1075: pause/resume must resume, not restart ──────────────────────────
  describe('pause/resume timer state (#1075)', () => {
    it('starts a countdown with the full duration running', () => {
      const err = createToast({ message: 'API request failed', variant: 'error' }, 'err-1');
      const started = startTimerState(err, 1_000);
      expect(started).toEqual({ remaining: DEFAULT_TOAST_DURATION, resumedAt: 1_000 });
      expect(timerDelay(started)).toBe(DEFAULT_TOAST_DURATION);
    });

    it('freezes the countdown with the rest still owing when paused mid-flight', () => {
      const err = createToast({ message: 'API request failed', variant: 'error' }, 'err-1');
      const started = startTimerState(err, 1_000);
      const paused = pauseTimerState(started, 2_500);
      expect(paused.resumedAt).toBeNull();
      expect(paused.remaining).toBe(DEFAULT_TOAST_DURATION - 1_500);

      // Pausing again (React fires mouseenter per element boundary) changes nothing.
      expect(pauseTimerState(paused, 9_999)).toEqual(paused);
    });

    it('resumes the remainder rather than restarting the full duration', () => {
      const err = createToast({ message: 'API request failed', variant: 'error' }, 'err-1');
      const started = startTimerState(err, 1_000);
      const paused = pauseTimerState(started, 2_500);

      // Leaving after a long hover resumes the *remainder* — the old code restarted
      // the full 5.5s here, which is why the toast never dismissed on time.
      const resumed = resumeTimerState(paused, 60_000);
      expect(resumed.remaining).toBe(DEFAULT_TOAST_DURATION - 1_500);
      expect(resumed.resumedAt).toBe(60_000);
      expect(resumed.remaining).toBeLessThan(DEFAULT_TOAST_DURATION);

      // Resuming a running countdown is a no-op, so it can't be extended.
      expect(resumeTimerState(resumed, 70_000)).toEqual(resumed);
    });

    it('genuinely completes the countdown across a pause/resume cycle', () => {
      const err = createToast({ message: 'API request failed', variant: 'error' }, 'err-1');
      const started = startTimerState(err, 1_000);
      const paused = pauseTimerState(started, 2_500);
      const resumed = resumeTimerState(paused, 60_000);

      const nearlyDone = pauseTimerState(resumed, 60_000 + resumed.remaining);
      expect(nearlyDone.remaining).toBe(0);

      // An expired countdown still dismisses promptly rather than scheduling a
      // non-positive timeout.
      expect(timerDelay(nearlyDone)).toBe(MIN_RESUME_DELAY);
      expect(MIN_RESUME_DELAY).toBeGreaterThan(0);
    });

    it('never counts elapsed time as negative if clocks jump backwards', () => {
      const err = createToast({ message: 'API request failed', variant: 'error' }, 'err-1');
      const started = startTimerState(err, 1_000);
      expect(pauseTimerState(started, 500).remaining).toBe(DEFAULT_TOAST_DURATION);
    });
  });
});
