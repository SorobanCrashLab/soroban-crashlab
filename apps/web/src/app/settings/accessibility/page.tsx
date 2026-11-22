'use client';

/**
 * settings/accessibility — Accessibility Preferences & Assistive Diagnostics Center (#1668, #2317).
 * Persisted via storage-registry.accessibilityPrefsStore; applied pre-paint
 * by the bootstrap script (see layout.tsx) to avoid flashes.
 */
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../components/LoadingSkeleton';
import { AccessibilityPreferencesCenter } from '../../../features/accessibility/AccessibilityPreferencesCenter';

const AddAccessibleKeyboardNavBlueprintPage49 = dynamic(
  () => import('../../../features/misc/add-accessible-keyboard-nav-blueprint-page-49'),
  { loading: () => <LoadingSpinner /> },
);

export default function AccessibilitySettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14 space-y-10">
      <div>
        <h1 className="heading-page">Accessibility preferences &amp; assistive diagnostics</h1>
        <p className="text-meta mt-1">
          Personalize motion, typography, contrast, density, focus indicators, and assistive alternatives for complex views, or run live WCAG 2.2 diagnostics.
        </p>
      </div>

      <AccessibilityPreferencesCenter />

      <AddAccessibleKeyboardNavBlueprintPage49 />
    </div>
  );
}

