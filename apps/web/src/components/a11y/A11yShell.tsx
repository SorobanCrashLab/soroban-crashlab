'use client';

import ScreenReaderAnnouncerProvider from '@/components/a11y/ScreenReaderAnnouncer';
import RouteAnnouncer from '@/components/a11y/RouteAnnouncer';
import { ReactNode } from 'react';

export default function A11yShell({ children }: { children: ReactNode }) {
  return (
    <ScreenReaderAnnouncerProvider>
      <RouteAnnouncer />
      {children}
    </ScreenReaderAnnouncerProvider>
  );
}
