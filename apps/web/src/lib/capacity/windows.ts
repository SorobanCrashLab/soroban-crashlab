/**
 * Scheduling windows per campaign class (#1904).
 *
 * Deep (and optionally nightly) campaigns can be confined to idle hours so they
 * never compete with interactive work at peak. Interactive campaigns always
 * run: someone is waiting on them, so they cannot be windowed.
 *
 * Configured with CRASHLAB_SCHEDULING_WINDOWS, e.g.
 *   deep=00:00-06:00,nightly=20:00-08:00
 * Times are UTC, `[start, end)`, and a window may wrap past midnight. A class
 * without a window is always open — the default, so nothing changes until an
 * operator opts in.
 */

import type { CampaignClass } from './quotas';

export interface SchedulingWindow {
  /** Minutes after 00:00 UTC. */
  startMinute: number;
  endMinute: number;
}

export type SchedulingWindows = Partial<Record<Exclude<CampaignClass, 'interactive'>, SchedulingWindow>>;

const MINUTES_PER_DAY = 24 * 60;

function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function parseSchedulingWindows(raw: string | undefined): {
  windows: SchedulingWindows;
  errors: string[];
} {
  const windows: SchedulingWindows = {};
  const errors: string[] = [];
  if (!raw || !raw.trim()) return { windows, errors };

  for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
    const match = /^([a-z]+)=(\d\d:\d\d)-(\d\d:\d\d)$/.exec(entry);
    if (!match) {
      errors.push(`"${entry}": expected <class>=HH:MM-HH:MM`);
      continue;
    }
    const [, cls, from, to] = match;
    if (cls !== 'nightly' && cls !== 'deep') {
      errors.push(`"${entry}": only nightly and deep campaigns can be windowed`);
      continue;
    }
    const startMinute = parseClock(from);
    const endMinute = parseClock(to);
    if (startMinute === null || endMinute === null || startMinute === endMinute) {
      errors.push(`"${entry}": invalid or empty time range`);
      continue;
    }
    windows[cls] = { startMinute, endMinute };
  }
  return { windows, errors };
}

/** Windows from the environment; invalid entries are ignored (and reported by GET /api/capacity). */
export function readSchedulingWindows() {
  return parseSchedulingWindows(process.env.CRASHLAB_SCHEDULING_WINDOWS);
}

function windowFor(windows: SchedulingWindows, campaignClass: CampaignClass): SchedulingWindow | undefined {
  return campaignClass === 'interactive' ? undefined : windows[campaignClass];
}

function minuteOfDay(now: Date): number {
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function contains(window: SchedulingWindow, minute: number): boolean {
  return window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;
}

export function isWindowOpen(windows: SchedulingWindows, campaignClass: CampaignClass, now: Date): boolean {
  const window = windowFor(windows, campaignClass);
  return window === undefined || contains(window, minuteOfDay(now));
}

/** Seconds until the class's window next opens (0 when open now). */
export function secondsUntilWindowOpens(windows: SchedulingWindows, campaignClass: CampaignClass, now: Date): number {
  const window = windowFor(windows, campaignClass);
  if (window === undefined) return 0;
  const minute = minuteOfDay(now);
  if (contains(window, minute)) return 0;
  const minutesAhead = (window.startMinute - minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return Math.max(minutesAhead * 60 - now.getUTCSeconds(), 1);
}

export function formatWindow(window: SchedulingWindow): string {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${clock(window.startMinute)}-${clock(window.endMinute)} UTC`;
}
