'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ReportingTemplateKind = 'issue' | 'pr';

interface ReportingTemplate {
  id: string;
  name: string;
  kind: ReportingTemplateKind;
  body: string;
  updatedAt: string;
}

const TEMPLATES_STORAGE_KEY = 'crashlab:reporting-templates:v1';
const SELECTED_TEMPLATE_STORAGE_KEY = 'crashlab:reporting-templates:selected:v1';

const DEFAULT_TEMPLATES: ReportingTemplate[] = [
  {
    id: 'rt-default-issue',
    name: 'Issue: Run Crash Report',
    kind: 'issue',
    body: `# 🚨 Crash Report\n\n## Summary\n- Run ID: \n- Status: \n- Area: \n- Severity: \n\n## What happened?\n\n## Steps to reproduce\n\n## Expected behavior\n\n## Logs / stack trace\n\n## Replay command\n\n\`\`\`bash\n# paste replay command here\n\`\`\`\n`,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'rt-default-pr',
    name: 'PR: Fix Verification Notes',
    kind: 'pr',
    body: `# ✅ Fix Summary\n\n## What changed?\n\n## How I verified\n- [ ] Reproduced original issue\n- [ ] Verified fix\n- [ ] Added/updated tests\n\n## Screenshots / recordings (if UI)\n\n## Follow-ups\n`,
    updatedAt: new Date(0).toISOString(),
  },
];

function generateTemplateId(): string {
  return `rt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTemplateKind(value: unknown): value is ReportingTemplateKind {
  return value === 'issue' || value === 'pr';
}

function isReportingTemplate(value: unknown): value is ReportingTemplate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReportingTemplate>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    isTemplateKind(candidate.kind) &&
    typeof candidate.body === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function readTemplatesFromStorage(): ReportingTemplate[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const templates = parsed.filter(isReportingTemplate);
    return templates.length ? templates : null;
  } catch {
    return null;
  }
}

function readSelectedTemplateIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SELECTED_TEMPLATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore write errors (private mode, quota, etc.)
  }
}

export default function CreateReportingTemplatesPage60() {
  const [hydrated, setHydrated] = useState(false);
  const [templates, setTemplates] = useState<ReportingTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATES[0]!.id);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const storedTemplates = readTemplatesFromStorage();
      const nextTemplates = storedTemplates ?? DEFAULT_TEMPLATES;

      setTemplates(nextTemplates);

      const storedSelected = readSelectedTemplateIdFromStorage();
      const validSelected = storedSelected && nextTemplates.some((tpl) => tpl.id === storedSelected);
      setSelectedId(validSelected ? storedSelected : nextTemplates[0]!.id);

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(t);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? templates[0] ?? null,
    [selectedId, templates],
  );

  useEffect(() => {
    if (!hydrated) return;
    safeWriteStorage(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }, [hydrated, templates]);

  useEffect(() => {
    if (!hydrated) return;
    safeWriteStorage(SELECTED_TEMPLATE_STORAGE_KEY, selectedId);
  }, [hydrated, selectedId]);

  const flashSaveState = useCallback((state: 'saved' | 'error') => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState(state);
    saveTimer.current = window.setTimeout(() => setSaveState('idle'), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const createTemplate = useCallback(() => {
    const now = new Date().toISOString();
    const template: ReportingTemplate = {
      id: generateTemplateId(),
      name: 'New Template',
      kind: 'issue',
      body: `# New Template\n\n`,
      updatedAt: now,
    };

    setTemplates((prev) => [template, ...prev]);
    setSelectedId(template.id);
    flashSaveState('saved');
  }, [flashSaveState]);

  const deleteTemplate = useCallback(
    (id: string) => {
      const template = templates.find((t) => t.id === id);
      if (!template) return;
      const ok = window.confirm(`Delete template "${template.name}"? This cannot be undone.`);
      if (!ok) return;

      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setSelectedId((prevSelected) => {
        if (prevSelected !== id) return prevSelected;
        const remaining = templates.filter((t) => t.id !== id);
        return remaining[0]?.id ?? DEFAULT_TEMPLATES[0]!.id;
      });
      flashSaveState('saved');
    },
    [flashSaveState, templates],
  );

  const duplicateTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    const now = new Date().toISOString();
    const copy: ReportingTemplate = {
      ...selectedTemplate,
      id: generateTemplateId(),
      name: `${selectedTemplate.name} (Copy)`,
      updatedAt: now,
    };
    setTemplates((prev) => [copy, ...prev]);
    setSelectedId(copy.id);
    flashSaveState('saved');
  }, [flashSaveState, selectedTemplate]);

  const updateSelectedTemplate = useCallback(
    (patch: Partial<Pick<ReportingTemplate, 'name' | 'kind' | 'body'>>) => {
      if (!selectedTemplate) return;
      const now = new Date().toISOString();
      setTemplates((prev) =>
        prev.map((tpl) => (tpl.id === selectedTemplate.id ? { ...tpl, ...patch, updatedAt: now } : tpl)),
      );
      flashSaveState('saved');
    },
    [flashSaveState, selectedTemplate],
  );

  const resetToDefaults = useCallback(() => {
    const ok = window.confirm('Reset templates to defaults? This will overwrite your saved templates.');
    if (!ok) return;
    setTemplates(DEFAULT_TEMPLATES);
    setSelectedId(DEFAULT_TEMPLATES[0]!.id);
    flashSaveState('saved');
  }, [flashSaveState]);

  const saveLabel =
    saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : hydrated ? 'Autosaved' : 'Loading…';

  return (
    <section
      id="reporting-templates"
      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm"
    >
      <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Reporting Templates</h2>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 ml-11">
              Create, save, and select reusable Issue/PR report templates (stored in your browser).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                saveState === 'saved'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : saveState === 'error'
                    ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 text-zinc-600 dark:text-zinc-300'
              }`}
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  saveState === 'saved'
                    ? 'bg-emerald-500'
                    : saveState === 'error'
                      ? 'bg-red-500'
                      : hydrated
                        ? 'bg-zinc-400'
                        : 'bg-zinc-300 animate-pulse'
                }`}
              />
              {saveLabel}
            </span>
            <button
              type="button"
              onClick={createTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow active:scale-95 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New template
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Saved templates</h3>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Reset
            </button>
          </div>

          <div className="space-y-2">
            {templates.map((template) => {
              const isSelected = template.id === selectedId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition shadow-sm ${
                    isSelected
                      ? 'border-indigo-300 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {template.name || 'Untitled'}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                            template.kind === 'issue'
                              ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                              : 'border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          {template.kind === 'issue' ? 'Issue' : 'PR'}
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {new Date(template.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-600 text-white shrink-0" aria-label="Selected">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {templates.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-600 dark:text-zinc-400">
              No templates yet. Click <span className="font-semibold">New template</span> to create one.
            </div>
          )}
        </aside>

        <div className="lg:col-span-2">
          {!selectedTemplate ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-zinc-600 dark:text-zinc-400">
              Select a template to start editing.
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Template editor</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Markdown supported. Changes are saved to local storage.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={duplicateTemplate}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 text-sm font-semibold"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h10M8 11h10M8 15h6M6 3h12a2 2 0 012 2v12M6 21H4a2 2 0 01-2-2V7a2 2 0 012-2h2" />
                    </svg>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(selectedTemplate.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M10 7V4a1 1 0 011-1h2a1 1 0 011 1v3m4 0H6" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Name</span>
                    <input
                      value={selectedTemplate.name}
                      onChange={(e) => updateSelectedTemplate({ name: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="Template name"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Type</span>
                    <select
                      value={selectedTemplate.kind}
                      onChange={(e) => updateSelectedTemplate({ kind: e.target.value as ReportingTemplateKind })}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    >
                      <option value="issue">Issue</option>
                      <option value="pr">PR</option>
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Template body</span>
                  <textarea
                    value={selectedTemplate.body}
                    onChange={(e) => updateSelectedTemplate({ body: e.target.value })}
                    className="min-h-[320px] px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                    placeholder="Write markdown here…"
                    spellCheck={false}
                  />
                </label>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/20 p-4">
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Selection</div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    The highlighted template on the left is the currently selected template.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
