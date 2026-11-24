'use client';

/**
 * Event timeline and transcript (#2341). The event list is filterable and
 * seekable; the transcript is the plain-text summary of key events, which is
 * also the accessible way to "read" a replay without watching it.
 */

import { useMemo, useState } from 'react';
import { AccessibleTabs } from '@/components/AccessibleTabs';
import type { ReplayEventType } from '../capture/schema';
import type { SessionReplayState } from '../hooks/useSessionReplay';
import { describeEvent, formatOffset, sortedEvents, transcript } from '../lib/timeline';

const FILTERS: Array<{ id: 'all' | ReplayEventType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'click', label: 'Clicks' },
  { id: 'input', label: 'Inputs' },
  { id: 'network', label: 'Network' },
  { id: 'error', label: 'Errors' },
  { id: 'console', label: 'Console' },
  { id: 'vital', label: 'Vitals' },
  { id: 'state', label: 'State' },
];

export function TimelinePanel({ replay }: { replay: SessionReplayState }) {
  const [tab, setTab] = useState<'events' | 'transcript'>('events');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const events = useMemo(() => (replay.session ? sortedEvents(replay.session) : []), [replay.session]);
  const lines = useMemo(() => (replay.session ? transcript(replay.session) : []), [replay.session]);
  if (!replay.session) return null;
  const visible = filter === 'all' ? events : events.filter((event) => event.type === filter);

  return (
    <section className="card card-padding min-w-0" aria-label="Timeline">
      <AccessibleTabs
        label="Timeline views"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { id: 'events', label: 'Events', badge: events.length },
          { id: 'transcript', label: 'Transcript' },
        ]}
      >
        {tab === 'events' ? (
          <>
            <label className="text-sm flex items-center gap-2 mb-2">
              Show
              <select className="input-field" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                {FILTERS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ol className="flex flex-col gap-0.5 max-h-96 overflow-auto text-sm">
              {visible.map((event, index) => {
                const past = event.t <= replay.t;
                const severity =
                  event.type === 'error' || (event.type === 'network' && !event.ok) || (event.type === 'console' && event.level === 'error') ? 'field-error' : '';
                return (
                  <li key={`${event.t}-${index}`}>
                    <button
                      type="button"
                      className={`text-left w-full px-1 rounded ${past ? '' : 'opacity-50'} ${severity}`}
                      onClick={() => replay.seek(event.t)}
                      aria-current={past && (visible[index + 1]?.t ?? Infinity) > replay.t ? 'step' : undefined}
                    >
                      <span className="font-mono text-xs mr-2">{formatOffset(event.t)}</span>
                      <span className="ds-badge ds-badge-neutral mr-1">{event.type}</span>
                      {describeEvent(event)}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <ol className="flex flex-col gap-1 text-sm" aria-label="Transcript of key events">
            {lines.map((line, index) => (
              <li key={index} className={line.severity === 'error' ? 'field-error' : line.severity === 'warn' ? '' : 'text-meta'}>
                {line.text}
              </li>
            ))}
          </ol>
        )}
      </AccessibleTabs>
    </section>
  );
}
