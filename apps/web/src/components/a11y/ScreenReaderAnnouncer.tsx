'use client';

/**
 * React binding for the announcement bus (#1884).
 *
 * Two *persistent* live regions are mounted once at the app shell. They never
 * unmount, so an announcement emitted immediately after navigation is still
 * picked up, and they are `aria-atomic` so readers hear the whole message.
 * Assistive tech ignores `sr-only` text visually but keeps both regions in the
 * accessibility tree.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createAnnouncer,
  type Announcement,
  type Announcer,
} from '@/lib/a11y/announcer';

const AnnouncerContext = createContext<Announcer | null>(null);

export function useAnnouncer(): Announcer {
  const context = useContext(AnnouncerContext);
  const fallbackRef = useRef<Announcer | null>(null);
  if (fallbackRef.current === null) {
    fallbackRef.current = createAnnouncer();
  }
  return context ?? fallbackRef.current;
}

export interface ScreenReaderAnnouncerProviderProps {
  children: ReactNode;
  /** Injectable for tests; production uses the default bus. */
  announcer?: Announcer;
}

export function ScreenReaderAnnouncerProvider({
  children,
  announcer: injected,
}: ScreenReaderAnnouncerProviderProps) {
  const announcer = useMemo(() => injected ?? createAnnouncer(), [injected]);
  const [polite, setPolite] = useState<Announcement | null>(null);
  const [assertive, setAssertive] = useState<Announcement | null>(null);

  useEffect(
    () =>
      announcer.subscribe((announcement) => {
        if (announcement.politeness === 'assertive') {
          setAssertive(announcement);
        } else {
          setPolite(announcement);
        }
      }),
    [announcer],
  );

  return (
    <AnnouncerContext.Provider value={announcer}>
      {children}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="sr-announcer-polite"
      >
        {polite ? (
          <span>
            {polite.message}
            {polite.id % 2 === 1 ? '\u200B' : ''}
          </span>
        ) : null}
      </div>
      <div
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="sr-announcer-assertive"
      >
        {assertive ? (
          <span>
            {assertive.message}
            {assertive.id % 2 === 1 ? '\u200B' : ''}
          </span>
        ) : null}
      </div>
    </AnnouncerContext.Provider>
  );
}

export default ScreenReaderAnnouncerProvider;
