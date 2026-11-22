'use client';

/**
 * /settings/shortcuts — Keyboard Shortcuts & Power-User Customization Center (#2315).
 */

import React from 'react';
import { ShortcutProvider } from '@/features/shortcuts/ShortcutProvider';
import { ShortcutSettings } from '@/features/shortcuts/ShortcutSettings';

export default function ShortcutsSettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-6xl mx-auto w-full py-14 space-y-8">
      <div>
        <h1 className="heading-page">
          Keyboard shortcuts &amp; power-user customization center
        </h1>
        <p className="text-meta mt-1">
          Discover contextual commands, remap bindings with conflict resolution, manage workspace profiles, and inspect non-keyboard UI alternatives.
        </p>
      </div>

      <ShortcutProvider>
        <ShortcutSettings />
      </ShortcutProvider>
    </div>
  );
}
