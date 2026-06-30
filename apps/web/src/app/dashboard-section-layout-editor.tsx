'use client';

import { useEffect, useState } from 'react';
import {
  DASHBOARD_LAYOUT_STORAGE_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardSectionConfig,
  type DashboardSectionId,
  parseDashboardLayout,
  reorderDashboardSection,
  serializeDashboardLayout,
  sortDashboardSections,
  toggleDashboardSectionVisibility,
} from './dashboard-layout-utils';

const SECTION_LABELS: Record<DashboardSectionId, string> = {
  stats: 'Summary Stats',
  'widget-editor': 'Layout Editor',
  'recent-runs': 'Recent Runs',
  'quick-actions': 'Quick Actions',
};

export default function DashboardSectionLayoutEditor() {
  const [sections, setSections] = useState<DashboardSectionConfig[]>(DEFAULT_DASHBOARD_LAYOUT);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
      setSections(parseDashboardLayout(raw));
    } catch {
      setSections(DEFAULT_DASHBOARD_LAYOUT);
    }
  }, []);

  const persist = (next: DashboardSectionConfig[]) => {
    const sorted = sortDashboardSections(next);
    setSections(sorted);
    try {
      localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, serializeDashboardLayout(sorted));
      setSavedMessage('Layout saved');
      window.dispatchEvent(new CustomEvent('dashboard-layout-updated'));
    } catch {
      setSavedMessage('Failed to save layout');
    }
  };

  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard Layout Editor</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Reorder and toggle dashboard sections. Changes apply immediately on this device.
          </p>
        </div>
        {savedMessage && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            {savedMessage}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {sortDashboardSections(sections).map((section, index) => (
          <div
            key={section.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                #{index + 1}
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {SECTION_LABELS[section.id]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => persist(toggleDashboardSectionVisibility(sections, section.id))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  section.visible
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {section.visible ? 'Visible' : 'Hidden'}
              </button>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => persist(reorderDashboardSection(sections, section.id, index - 1))}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
              >
                Up
              </button>
              <button
                type="button"
                disabled={index === sections.length - 1}
                onClick={() => persist(reorderDashboardSection(sections, section.id, index + 1))}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
              >
                Down
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
