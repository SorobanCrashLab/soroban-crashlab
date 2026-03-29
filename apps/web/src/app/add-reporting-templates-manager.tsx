'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateKind = 'issue' | 'pr';

interface ManagedTemplate {
    /** Stable unique identifier. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Determines the kind badge colour. */
    kind: TemplateKind;
    /** Markdown body of the template. */
    body: string;
    /** ISO timestamp of last modification. */
    updatedAt: string;
    /** Whether this template is pinned to the top of the list. */
    pinned: boolean;
    /** Free-text tags for filtering. */
    tags: string[];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'crashlab:template-manager:v1';

const DEFAULT_TEMPLATES: ManagedTemplate[] = [
    {
        id: 'mgr-default-issue',
        name: 'Issue: Run Crash Report',
        kind: 'issue',
        body: `# Crash Report\n\n## Summary\n- Run ID: \n- Status: \n- Area: \n- Severity: \n\n## What happened?\n\n## Steps to reproduce\n\n## Expected behavior\n\n## Logs / stack trace\n\n## Replay command\n\n\`\`\`bash\n# paste replay command here\n\`\`\`\n`,
        updatedAt: new Date(0).toISOString(),
        pinned: true,
        tags: ['crash', 'triage'],
    },
    {
        id: 'mgr-default-pr',
        name: 'PR: Fix Verification Notes',
        kind: 'pr',
        body: `# Fix Summary\n\n## What changed?\n\n## How I verified\n- [ ] Reproduced original issue\n- [ ] Verified fix\n- [ ] Added/updated tests\n\n## Screenshots / recordings (if UI)\n\n## Follow-ups\n`,
        updatedAt: new Date(0).toISOString(),
        pinned: false,
        tags: ['fix', 'review'],
    },
    {
        id: 'mgr-default-perf',
        name: 'Issue: Performance Regression',
        kind: 'issue',
        body: `# Performance Regression\n\n## Run ID\n\n## Metrics\n| Metric | Before | After |\n|---|---|---|\n| CPU instructions | | |\n| Memory bytes | | |\n| Min resource fee | | |\n\n## Root cause hypothesis\n\n## Suggested fix\n`,
        updatedAt: new Date(0).toISOString(),
        pinned: false,
        tags: ['performance', 'regression'],
    },
    {
        id: 'mgr-default-invariant',
        name: 'Issue: Invariant Violation',
        kind: 'issue',
        body: `# Invariant Violation\n\n## Signature\n\n## Payload\n\`\`\`json\n\`\`\`\n\n## Failure category\n\n## Replay command\n\`\`\`bash\n\`\`\`\n\n## Affected contracts\n`,
        updatedAt: new Date(0).toISOString(),
        pinned: false,
        tags: ['invariant', 'crash'],
    },
];

function isManagedTemplate(v: unknown): v is ManagedTemplate {
    if (!v || typeof v !== 'object') return false;
    const c = v as Partial<ManagedTemplate>;
    return (
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        (c.kind === 'issue' || c.kind === 'pr') &&
        typeof c.body === 'string' &&
        typeof c.updatedAt === 'string' &&
        typeof c.pinned === 'boolean' &&
        Array.isArray(c.tags)
    );
}

function readStorage(): ManagedTemplate[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return null;
        const valid = parsed.filter(isManagedTemplate);
        return valid.length > 0 ? valid : null;
    } catch {
        return null;
    }
}

function writeStorage(templates: ManagedTemplate[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
        // quota / private mode — ignore silently
    }
}

function generateId(): string {
    return `mgr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const KIND_BADGE: Record<TemplateKind, string> = {
    issue: 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
    pr: 'border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300',
};

/** Pill badge that shows "Issue" or "PR". */
const KindBadge = ({ kind }: { kind: TemplateKind }) => (
    <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${KIND_BADGE[kind]}`}
    >
        {kind === 'issue' ? 'Issue' : 'PR'}
    </span>
);

/** Tag chip shown in the list and in the detail panel. */
const TagChip = ({
    label,
    onRemove,
}: {
    label: string;
    onRemove?: () => void;
}) => (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {onRemove && (
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove tag ${label}`}
                className="ml-0.5 rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-600 p-0.5 transition"
            >
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M6.42 5l2.29-2.29a1 1 0 00-1.41-1.41L5 3.58 2.71 1.29A1 1 0 001.3 2.7L3.58 5 1.29 7.29a1 1 0 001.41 1.41L5 6.42l2.29 2.29a1 1 0 001.41-1.41L6.42 5z" />
                </svg>
            </button>
        )}
    </span>
);

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * ReportingTemplatesManager
 *
 * A dashboard panel that lets users browse, search, filter, preview, pin,
 * copy, export and import reporting templates. Templates persist in
 * localStorage between sessions.
 *
 * This component is complementary to CreateReportingTemplatesPage60 (which
 * focuses on the authoring / editing workflow). The manager focuses on the
 * discovery and application workflow.
 */
export default function ReportingTemplatesManager() {
    // ── State ──────────────────────────────────────────────────────────────
    const [hydrated, setHydrated] = useState(false);
    const [templates, setTemplates] = useState<ManagedTemplate[]>(DEFAULT_TEMPLATES);
    const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATES[0]!.id);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState<'all' | TemplateKind>('all');
    const [tagFilter, setTagFilter] = useState<string>('');
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
    const [importError, setImportError] = useState<string | null>(null);
    const [saveFlash, setSaveFlash] = useState(false);
    const [draftTag, setDraftTag] = useState('');

    const copyTimer = useRef<number | null>(null);
    const flashTimer = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Hydrate from localStorage ──────────────────────────────────────────
    useEffect(() => {
        const t = window.setTimeout(() => {
            const stored = readStorage();
            if (stored) {
                setTemplates(stored);
                setSelectedId(stored[0]?.id ?? DEFAULT_TEMPLATES[0]!.id);
            }
            setHydrated(true);
        }, 0);
        return () => window.clearTimeout(t);
    }, []);

    // ── Persist on every change (after hydration) ──────────────────────────
    useEffect(() => {
        if (hydrated) writeStorage(templates);
    }, [hydrated, templates]);

    // ── Flash "Saved" indicator ────────────────────────────────────────────
    const flashSaved = useCallback(() => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        setSaveFlash(true);
        flashTimer.current = window.setTimeout(() => setSaveFlash(false), 1400);
    }, []);

    useEffect(() => () => {
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
    }, []);

    // ── Derived state ──────────────────────────────────────────────────────

    /** All tags across all templates, deduplicated and sorted. */
    const allTags = useMemo(() => {
        const set = new Set<string>();
        templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
        return [...set].sort();
    }, [templates]);

    /** Filtered + re-ordered list (pinned first). */
    const filteredTemplates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return templates
            .filter((t) => {
                if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
                if (tagFilter && !t.tags.includes(tagFilter)) return false;
                if (q) {
                    return (
                        t.name.toLowerCase().includes(q) ||
                        t.body.toLowerCase().includes(q) ||
                        t.tags.some((tag) => tag.includes(q))
                    );
                }
                return true;
            })
            .sort((a, b) => Number(b.pinned) - Number(a.pinned));
    }, [templates, search, kindFilter, tagFilter]);

    const selectedTemplate = useMemo(
        () => templates.find((t) => t.id === selectedId) ?? filteredTemplates[0] ?? null,
        [selectedId, templates, filteredTemplates],
    );

    // ── Actions ────────────────────────────────────────────────────────────

    const mutate = useCallback(
        (id: string, patch: Partial<ManagedTemplate>) => {
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
                ),
            );
            flashSaved();
        },
        [flashSaved],
    );

    const handleTogglePin = useCallback(
        (id: string) => {
            const tpl = templates.find((t) => t.id === id);
            if (tpl) mutate(id, { pinned: !tpl.pinned });
        },
        [mutate, templates],
    );

    const handleCreate = useCallback(() => {
        const now = new Date().toISOString();
        const tpl: ManagedTemplate = {
            id: generateId(),
            name: 'New Template',
            kind: 'issue',
            body: '# New Template\n\n',
            updatedAt: now,
            pinned: false,
            tags: [],
        };
        setTemplates((prev) => [tpl, ...prev]);
        setSelectedId(tpl.id);
        flashSaved();
    }, [flashSaved]);

    const handleDelete = useCallback(
        (id: string) => {
            const tpl = templates.find((t) => t.id === id);
            if (!tpl) return;
            if (!window.confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
            setTemplates((prev) => {
                const next = prev.filter((t) => t.id !== id);
                const nextSelected = next[0]?.id ?? '';
                setSelectedId((cur) => (cur === id ? nextSelected : cur));
                return next;
            });
            flashSaved();
        },
        [flashSaved, templates],
    );

    const handleDuplicate = useCallback(
        (id: string) => {
            const tpl = templates.find((t) => t.id === id);
            if (!tpl) return;
            const copy: ManagedTemplate = {
                ...tpl,
                id: generateId(),
                name: `${tpl.name} (Copy)`,
                pinned: false,
                updatedAt: new Date().toISOString(),
            };
            setTemplates((prev) => [copy, ...prev]);
            setSelectedId(copy.id);
            flashSaved();
        },
        [flashSaved, templates],
    );

    const handleCopyBody = useCallback(async () => {
        if (!selectedTemplate) return;
        try {
            await navigator.clipboard.writeText(selectedTemplate.body);
            setCopyState('copied');
            if (copyTimer.current) window.clearTimeout(copyTimer.current);
            copyTimer.current = window.setTimeout(() => setCopyState('idle'), 1800);
        } catch {
            // clipboard denied — silent
        }
    }, [selectedTemplate]);

    const handleAddTag = useCallback(() => {
        if (!selectedTemplate) return;
        const tag = draftTag.trim().toLowerCase().replace(/\s+/g, '-');
        if (!tag || selectedTemplate.tags.includes(tag)) {
            setDraftTag('');
            return;
        }
        mutate(selectedTemplate.id, { tags: [...selectedTemplate.tags, tag].sort() });
        setDraftTag('');
    }, [draftTag, mutate, selectedTemplate]);

    const handleRemoveTag = useCallback(
        (tag: string) => {
            if (!selectedTemplate) return;
            mutate(selectedTemplate.id, { tags: selectedTemplate.tags.filter((t) => t !== tag) });
        },
        [mutate, selectedTemplate],
    );

    /** Export all templates as a JSON file download. */
    const handleExport = useCallback(() => {
        const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crashlab-templates-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [templates]);

    /** Import templates from a JSON file, merging by id. */
    const handleImport = useCallback(
        (e: { target: HTMLInputElement }) => {
            setImportError(null);
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result as string) as unknown;
                    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array.');
                    const incoming = parsed.filter(isManagedTemplate);
                    if (incoming.length === 0) throw new Error('No valid templates found in file.');
                    setTemplates((prev) => {
                        const existingIds = new Set(prev.map((t) => t.id));
                        const merged = [
                            ...prev,
                            ...incoming.filter((t) => !existingIds.has(t.id)),
                        ];
                        return merged;
                    });
                    flashSaved();
                } catch (err) {
                    setImportError(err instanceof Error ? err.message : 'Import failed.');
                }
            };
            reader.readAsText(file);
            // Reset so the same file can be re-imported
            e.target.value = '';
        },
        [flashSaved],
    );

    const handleResetDefaults = useCallback(() => {
        if (!window.confirm('Reset to defaults? Your custom templates will be removed.')) return;
        setTemplates(DEFAULT_TEMPLATES);
        setSelectedId(DEFAULT_TEMPLATES[0]!.id);
        flashSaved();
    }, [flashSaved]);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <section
            id="reporting-templates-manager"
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm"
            aria-label="Reporting templates manager"
        >
            {/* ── Panel header ─────────────────────────────────────────── */}
            <div className="p-6 md:p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-8 rounded-lg bg-violet-600 dark:bg-violet-500 flex items-center justify-center text-white shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6M4 6h16M4 10h4M4 14h4M4 18h16" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                                Reporting Templates Manager
                            </h2>
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 ml-11">
                            Browse, search, pin, and copy your Issue/PR templates. Export or import as JSON for team sharing.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Autosave indicator */}
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${saveFlash
                                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                    : 'border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400'
                                }`}
                            aria-live="polite"
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${saveFlash ? 'bg-emerald-500' : hydrated ? 'bg-zinc-400' : 'bg-zinc-300 animate-pulse'}`} />
                            {saveFlash ? 'Saved' : hydrated ? 'Autosaved' : 'Loading…'}
                        </span>

                        {/* Import */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 text-sm font-semibold transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v8M8 16l4-4 4 4M12 4v8" />
                            </svg>
                            Import JSON
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="sr-only"
                            onChange={handleImport}
                            aria-label="Import templates JSON file"
                        />

                        {/* Export */}
                        <button
                            type="button"
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 text-sm font-semibold transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v8m-4-4l4 4 4-4" />
                            </svg>
                            Export JSON
                        </button>

                        {/* New */}
                        <button
                            type="button"
                            onClick={handleCreate}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm shadow active:scale-95 transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New template
                        </button>
                    </div>
                </div>

                {importError && (
                    <p
                        role="alert"
                        className="mt-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm text-red-700 dark:text-red-300"
                    >
                        {importError}
                    </p>
                )}
            </div>

            {/* ── Search / filter bar ───────────────────────────────────── */}
            <div className="px-6 md:px-8 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row gap-3">
                {/* Text search */}
                <div className="relative flex-1">
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                    </svg>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search templates…"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>

                {/* Kind filter */}
                <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as 'all' | TemplateKind)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                    <option value="all">All types</option>
                    <option value="issue">Issue only</option>
                    <option value="pr">PR only</option>
                </select>

                {/* Tag filter */}
                <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                    <option value="">All tags</option>
                    {allTags.map((tag) => (
                        <option key={tag} value={tag}>
                            {tag}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition shrink-0"
                >
                    Reset defaults
                </button>
            </div>

            {/* ── Two-column body ───────────────────────────────────────── */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: template list ──────────────────────────── */}
                <aside className="lg:col-span-1 flex flex-col gap-2" aria-label="Template list">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            {filteredTemplates.length} of {templates.length} templates
                        </span>
                    </div>

                    {filteredTemplates.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                            No templates match your filters.
                        </div>
                    ) : (
                        filteredTemplates.map((tpl) => {
                            const isSelected = tpl.id === selectedId;
                            return (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => setSelectedId(tpl.id)}
                                    className={`w-full text-left rounded-xl border px-4 py-3 transition shadow-sm group ${isSelected
                                            ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30'
                                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                                        }`}
                                    aria-pressed={isSelected}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {tpl.pinned && (
                                                    <svg className="w-3 h-3 text-violet-500 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-label="Pinned">
                                                        <path d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" />
                                                    </svg>
                                                )}
                                                <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                                    {tpl.name || 'Untitled'}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                                <KindBadge kind={tpl.kind} />
                                                {tpl.tags.slice(0, 3).map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {tpl.tags.length > 3 && (
                                                    <span className="text-[10px] text-zinc-400">+{tpl.tags.length - 3}</span>
                                                )}
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <span
                                                className="h-5 w-5 rounded-full flex items-center justify-center bg-violet-600 text-white shrink-0"
                                                aria-label="Active selection"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </aside>

                {/* ── Right: detail / preview panel ───────────────── */}
                <div className="lg:col-span-2">
                    {!selectedTemplate ? (
                        <div className="h-full rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            Select a template from the list to preview it.
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                            {/* Detail header */}
                            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <KindBadge kind={selectedTemplate.kind} />
                                    <input
                                        value={selectedTemplate.name}
                                        onChange={(e) => mutate(selectedTemplate.id, { name: e.target.value })}
                                        className="flex-1 font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:border-violet-500 text-sm transition min-w-0"
                                        aria-label="Template name"
                                    />
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2">
                                    {/* Pin/unpin */}
                                    <button
                                        type="button"
                                        onClick={() => handleTogglePin(selectedTemplate.id)}
                                        title={selectedTemplate.pinned ? 'Unpin' : 'Pin to top'}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${selectedTemplate.pinned
                                                ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                                                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" />
                                        </svg>
                                        {selectedTemplate.pinned ? 'Pinned' : 'Pin'}
                                    </button>

                                    {/* Copy body */}
                                    <button
                                        type="button"
                                        onClick={handleCopyBody}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition"
                                    >
                                        {copyState === 'copied' ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-2M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8" />
                                                </svg>
                                                Copy body
                                            </>
                                        )}
                                    </button>

                                    {/* Duplicate */}
                                    <button
                                        type="button"
                                        onClick={() => handleDuplicate(selectedTemplate.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h10M8 11h10M8 15h6M6 3h12a2 2 0 012 2v12M6 21H4a2 2 0 01-2-2V7a2 2 0 012-2h2" />
                                        </svg>
                                        Duplicate
                                    </button>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(selectedTemplate.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M10 7V4a1 1 0 011-1h2a1 1 0 011 1v3m4 0H6" />
                                        </svg>
                                        Delete
                                    </button>
                                </div>
                            </div>

                            {/* Detail body */}
                            <div className="p-5 space-y-5">
                                {/* Kind selector */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 w-10 shrink-0">Type</span>
                                    <select
                                        value={selectedTemplate.kind}
                                        onChange={(e) => mutate(selectedTemplate.id, { kind: e.target.value as TemplateKind })}
                                        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="issue">Issue</option>
                                        <option value="pr">PR</option>
                                    </select>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                        Updated {new Date(selectedTemplate.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>

                                {/* Tags */}
                                <div>
                                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Tags</div>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {selectedTemplate.tags.map((tag) => (
                                            <TagChip key={tag} label={tag} onRemove={() => handleRemoveTag(tag)} />
                                        ))}
                                        {selectedTemplate.tags.length === 0 && (
                                            <span className="text-xs text-zinc-400 dark:text-zinc-500">No tags yet.</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={draftTag}
                                            onChange={(e) => setDraftTag(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddTag();
                                                }
                                            }}
                                            placeholder="Add tag…"
                                            className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddTag}
                                            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* Body preview (read-only, monospace) */}
                                <div>
                                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">
                                        Body preview
                                        <span className="ml-2 font-normal text-zinc-400">(markdown)</span>
                                    </div>
                                    <pre className="w-full min-h-[200px] max-h-[360px] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 p-4 text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                                        {selectedTemplate.body || '(empty)'}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
