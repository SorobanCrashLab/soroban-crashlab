'use client';

/**
 * settings/accessibility — functional motion / text-size / contrast (#1668).
 * Persisted via storage-registry.accessibilityPrefsStore; applied pre-paint
 * by the bootstrap script (see layout.tsx) to avoid flashes.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../components/LoadingSkeleton';
import { useAccessibility } from '../../../components/AccessibilityProvider';
import type { ContrastPref, MotionPref, TextScale } from '../../../lib/accessibility-prefs';

const AddAccessibleKeyboardNavBlueprintPage49 = dynamic(
  () => import('../../add-accessible-keyboard-nav-blueprint-page-49'),
  { loading: () => <LoadingSpinner /> },
);

const TEXT_SCALES: TextScale[] = [100, 112, 125, 150];

export default function AccessibilitySettingsPage() {
  const { prefs, setPrefs, mounted } = useAccessibility();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14 space-y-10">
      <div>
        <h1 className="heading-page">Accessibility preferences</h1>
        <p className="text-meta mt-1">Motion, text size, and contrast overrides. Saved per user and applied before paint.</p>
      </div>

      <section aria-labelledby="a11y-motion" className="card card-padding">
        <h2 id="a11y-motion" className="heading-section mb-1">Motion</h2>
        <p className="text-meta mb-4">Reduced disables scroll/animation effects (WCAG 2.3.3).</p>
        <div role="radiogroup" aria-label="Motion preference" className="flex flex-wrap gap-2">
          {(['system', 'reduced', 'full'] as MotionPref[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={prefs.motion === m}
              disabled={!mounted}
              onClick={() => {
                setPrefs({ ...prefs, motion: m });
                setSaved(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${prefs.motion === m ? 'border-[#0A66C2] bg-[#0A66C2] text-white' : ''}`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="a11y-text" className="card card-padding">
        <h2 id="a11y-text" className="heading-section mb-1">Text size</h2>
        <p className="text-meta mb-4">Root font scaling up to 150% (WCAG 1.4.4).</p>
        <div role="radiogroup" aria-label="Text size" className="flex flex-wrap gap-2">
          {TEXT_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={prefs.textScale === s}
              disabled={!mounted}
              onClick={() => {
                setPrefs({ ...prefs, textScale: s });
                setSaved(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${prefs.textScale === s ? 'border-[#0A66C2] bg-[#0A66C2] text-white' : ''}`}
            >
              {s}%
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="a11y-contrast" className="card card-padding">
        <h2 id="a11y-contrast" className="heading-section mb-1">Contrast</h2>
        <p className="text-meta mb-4">High-contrast token set audited for WCAG AA.</p>
        <div role="radiogroup" aria-label="Contrast" className="flex flex-wrap gap-2">
          {(['standard', 'high'] as ContrastPref[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={prefs.contrast === c}
              disabled={!mounted}
              onClick={() => {
                setPrefs({ ...prefs, contrast: c });
                setSaved(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${prefs.contrast === c ? 'border-[#0A66C2] bg-[#0A66C2] text-white' : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <div aria-live="polite" className="sr-only">{saved ? 'Preferences saved.' : ''}</div>

      <AddAccessibleKeyboardNavBlueprintPage49 />
    </div>
  );
}
