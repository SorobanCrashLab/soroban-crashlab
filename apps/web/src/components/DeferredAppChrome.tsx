'use client';

import dynamic from 'next/dynamic';

/**
 * Global, interaction-only chrome. These components are not needed for the
 * first paint, so keeping them out of the layout's initial client chunk trims
 * every route's first-load JS (#1881). They still mount immediately after
 * hydration, so keyboard shortcuts and the tour behave as before.
 */
const AddKeyboardShortcutCheatsheetModal = dynamic(
  () => import('../features/misc/add-keyboard-shortcut-cheatsheet-modal'),
  { ssr: false },
);
const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false });
const OnboardingWizardHost = dynamic(() => import('../app/OnboardingWizardHost'), {
  ssr: false,
});

export function DeferredAppChrome() {
  return (
    <>
      <AddKeyboardShortcutCheatsheetModal />
      <CommandPalette />
      <OnboardingWizardHost />
    </>
  );
}
