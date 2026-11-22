import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEDUPE_WINDOW_MS,
  createAnnouncer,
  normalizeAnnouncement,
} from './announcer';

describe('screen-reader announcer', () => {
  it('normalizes whitespace and ignores empty messages', () => {
    const announcer = createAnnouncer();
    expect(normalizeAnnouncement('  run   status \n changed  ')).toBe('run status changed');
    expect(announcer.announce('   ')).toBeNull();
    expect(announcer.announce('')).toBeNull();
    expect(announcer.getHistory()).toHaveLength(0);
  });

  it('publishes accepted announcements to every subscriber', () => {
    const announcer = createAnnouncer();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = announcer.subscribe(first);
    announcer.subscribe(second);

    const announcement = announcer.announce('Run status changed to failed.');

    expect(announcement).toMatchObject({
      message: 'Run status changed to failed.',
      politeness: 'polite',
    });
    expect(first).toHaveBeenCalledWith(announcement);
    expect(second).toHaveBeenCalledWith(announcement);

    unsubscribe();
    announcer.announce('Something else.');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('suppresses identical messages inside the dedupe window only', () => {
    let now = 1_000;
    const announcer = createAnnouncer({ now: () => now });

    expect(announcer.announce('Reconnecting.')?.id).toBe(1);
    now += DEFAULT_DEDUPE_WINDOW_MS - 1;
    expect(announcer.announce('  Reconnecting.  ')).toBeNull();
    now += 1;
    expect(announcer.announce('Reconnecting.')?.id).toBe(2);
    // A different politeness is a different channel, so it is not deduped.
    expect(announcer.announce('Reconnecting.', { politeness: 'assertive' })?.id).toBe(3);
  });

  it('assigns increasing ids so repeated text can still trigger a DOM update', () => {
    let now = 0;
    const announcer = createAnnouncer({ now: () => now });
    const first = announcer.announce('Saved', { dedupeWindowMs: 0 });
    now += 1;
    const second = announcer.announce('Saved', { dedupeWindowMs: 0 });

    expect(first?.id).toBe(1);
    expect(second?.id).toBe(2);
  });

  it('tracks the current announcement per politeness', () => {
    const announcer = createAnnouncer();
    announcer.announce('Polite update');
    announcer.announce('Urgent update', { politeness: 'assertive' });

    expect(announcer.getCurrent('polite')?.message).toBe('Polite update');
    expect(announcer.getCurrent('assertive')?.message).toBe('Urgent update');
    expect(announcer.getCurrent()?.message).toBe('Urgent update');
    expect(createAnnouncer().getCurrent()).toBeNull();
  });

  it('bounds history and can be cleared', () => {
    const announcer = createAnnouncer({ maxHistory: 3, now: () => 0 });
    for (let index = 0; index < 10; index += 1) {
      announcer.announce(`Update ${index}`, { dedupeWindowMs: 0 });
    }

    expect(announcer.getHistory().map((entry) => entry.message)).toEqual([
      'Update 7',
      'Update 8',
      'Update 9',
    ]);
    announcer.clear();
    expect(announcer.getHistory()).toHaveLength(0);
  });
});
