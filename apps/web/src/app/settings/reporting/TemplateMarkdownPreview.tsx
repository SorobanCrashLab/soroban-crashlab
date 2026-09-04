'use client';

/**
 * Markdown preview pane for reporting templates (#1118).
 *
 * Renders a template body with react-markdown + remark-gfm, and surrounds it
 * with the affordances an author actually needs: a sample-data toggle so
 * `{{run_id}}` placeholders read like a real report, an outline, document
 * stats, and copy/download actions.
 *
 * Colours come from the Navy Professional CSS variables in globals.css so the
 * pane follows the active light/dark theme without duplicating a palette.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadTextFile } from '../../utils/browser-download';
import {
    TEMPLATE_VARIABLES,
    buildPreviewSource,
    buildTemplateFilename,
    extractHeadings,
    extractPlaceholders,
    summarizeMarkdown,
    validateTemplateBody,
} from './template-preview-utils';

interface TemplateMarkdownPreviewProps {
    /** Raw Markdown body of the selected template. */
    body: string;
    /** Template name, used for the download filename. */
    templateName: string;
    /** Renders a skeleton while the editor is still hydrating from storage. */
    isLoading?: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

const ACCENT = '#0A66C2';

/** Known placeholder tokens, for telling typos apart from supported variables. */
const KNOWN_TOKENS = new Set(TEMPLATE_VARIABLES.map((variable) => variable.token));

/**
 * Element overrides for react-markdown. Defined once at module scope so the
 * renderer is not handed a new object on every keystroke.
 */
const MARKDOWN_COMPONENTS: Components = {
    h1: ({ children }) => (
        <h1 className="text-xl font-bold mt-0 mb-3 pb-2 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-base font-bold mt-5 mb-2" style={{ color: 'var(--text-primary)' }}>
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-sm font-semibold mt-4 mb-2" style={{ color: 'var(--text-primary)' }}>
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold mt-3 mb-1" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </h4>
    ),
    p: ({ children }) => (
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-primary)' }}>
            {children}
        </p>
    ),
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
    li: ({ children }) => (
        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {children}
        </li>
    ),
    a: ({ children, href }) => (
        <a href={href} className="link" target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {children}
        </strong>
    ),
    blockquote: ({ children }) => (
        <blockquote className="pl-4 my-3 italic text-sm" style={{ borderLeft: `3px solid ${ACCENT}`, color: 'var(--text-secondary)' }}>
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-4" style={{ borderColor: 'var(--border-color)' }} />,
    table: ({ children }) => (
        <div className="overflow-x-auto my-3">
            <table className="data-table">{children}</table>
        </div>
    ),
    // react-markdown v10 no longer passes an `inline` flag, so block code is
    // identified by its language class or by spanning more than one line.
    // `pre` is collapsed to a fragment to avoid nesting two <pre> elements.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
        const text = String(children ?? '');
        const isBlock = (className ?? '').includes('language-') || text.includes('\n');

        if (!isBlock) {
            return (
                <code
                    className="code-text px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--chip-bg)', color: ACCENT }}
                >
                    {children}
                </code>
            );
        }

        return (
            <pre
                className="my-3 p-3 rounded-lg overflow-x-auto border"
                style={{ background: 'var(--bg)', borderColor: 'var(--border-color)' }}
            >
                <code className="code-text" style={{ color: 'var(--text-primary)' }}>
                    {children}
                </code>
            </pre>
        );
    },
};

/** A single labelled number in the stats row. */
function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex flex-col">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {value.toLocaleString()}
            </span>
            <span className="text-caption">{label}</span>
        </div>
    );
}

/** Neutral container so every preview state shares the same frame. */
function PreviewSurface({ children }: { children: ReactNode }) {
    return (
        <div
            className="rounded-xl border p-4 md:p-6 overflow-y-auto max-h-[420px]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-color)' }}
        >
            {children}
        </div>
    );
}

export default function TemplateMarkdownPreview({
    body,
    templateName,
    isLoading = false,
}: TemplateMarkdownPreviewProps) {
    const [useSampleValues, setUseSampleValues] = useState(true);
    const [copyState, setCopyState] = useState<CopyState>('idle');
    const copyTimer = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copyTimer.current) window.clearTimeout(copyTimer.current);
        };
    }, []);

    const validation = useMemo(() => validateTemplateBody(body), [body]);
    const source = useMemo(
        () => buildPreviewSource(body, useSampleValues),
        [body, useSampleValues],
    );
    const summary = useMemo(() => summarizeMarkdown(body), [body]);
    const headings = useMemo(() => extractHeadings(body), [body]);
    const unknownTokens = useMemo(
        () => extractPlaceholders(body).filter((token) => !KNOWN_TOKENS.has(token)),
        [body],
    );

    const flashCopyState = useCallback((state: CopyState) => {
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
        setCopyState(state);
        copyTimer.current = window.setTimeout(() => setCopyState('idle'), 1500);
    }, []);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(source);
            flashCopyState('copied');
        } catch {
            flashCopyState('failed');
        }
    }, [flashCopyState, source]);

    const handleDownload = useCallback(() => {
        downloadTextFile(source, buildTemplateFilename(templateName), 'text/markdown');
    }, [source, templateName]);

    if (isLoading) {
        return (
            <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading template preview</span>
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-24 w-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Preview
                    </span>
                    <button
                        type="button"
                        onClick={() => setUseSampleValues((previous) => !previous)}
                        aria-pressed={useSampleValues}
                        className="chip text-xs"
                        style={
                            useSampleValues
                                ? { background: 'var(--highlight-bg)', color: ACCENT }
                                : undefined
                        }
                        title="Replace {{placeholders}} with example run values"
                    >
                        Sample data {useSampleValues ? 'on' : 'off'}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCopy}
                        disabled={validation.status === 'empty'}
                        className="btn-ghost text-xs h-8 px-3 disabled:opacity-40"
                    >
                        {copyState === 'copied'
                            ? 'Copied'
                            : copyState === 'failed'
                              ? 'Copy failed'
                              : 'Copy Markdown'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={validation.status === 'empty'}
                        className="btn-outline text-xs h-8 px-3 disabled:opacity-40"
                    >
                        Download .md
                    </button>
                </div>
            </div>

            {copyState === 'failed' && (
                <p role="alert" className="text-xs" style={{ color: '#CC1016' }}>
                    Clipboard access was blocked by the browser. Use Download .md instead.
                </p>
            )}

            {/* Stats */}
            <div
                className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border px-4 py-3"
                style={{ background: 'var(--bg)', borderColor: 'var(--border-color)' }}
            >
                <Stat label="Headings" value={summary.headings} />
                <Stat label="Checklist items" value={summary.checklistItems} />
                <Stat label="Code blocks" value={summary.codeBlocks} />
                <Stat label="Links" value={summary.links} />
                <Stat label="Words" value={summary.words} />
            </div>

            {unknownTokens.length > 0 && (
                <p className="text-xs" style={{ color: '#946210' }}>
                    Unrecognised placeholder{unknownTokens.length > 1 ? 's' : ''}:{' '}
                    {unknownTokens.map((token) => `{{${token}}}`).join(', ')}. These stay
                    unsubstituted in the preview.
                </p>
            )}

            {/* Outline */}
            {headings.length > 1 && (
                <details
                    className="rounded-xl border px-4 py-3"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border-color)' }}
                >
                    <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        Outline ({headings.length} sections)
                    </summary>
                    <ul className="mt-2 space-y-1">
                        {headings.map((heading, index) => (
                            <li
                                key={`${heading.depth}-${heading.text}-${index}`}
                                className="text-xs truncate"
                                style={{
                                    paddingLeft: `${(heading.depth - 1) * 12}px`,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {heading.text}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {/* Rendered output */}
            {validation.status === 'empty' ? (
                <PreviewSurface>
                    <div className="text-center py-8">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Nothing to preview yet
                        </p>
                        <p className="text-meta mt-1">{validation.message}</p>
                    </div>
                </PreviewSurface>
            ) : validation.status === 'too-large' ? (
                <div
                    role="alert"
                    className="rounded-xl border p-4"
                    style={{ borderColor: '#CC1016', background: 'rgba(204, 16, 22, 0.06)' }}
                >
                    <p className="text-sm font-semibold" style={{ color: '#CC1016' }}>
                        Preview unavailable
                    </p>
                    <p className="text-meta mt-1">{validation.message}</p>
                </div>
            ) : (
                <PreviewSurface>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                        {source}
                    </ReactMarkdown>
                </PreviewSurface>
            )}
        </div>
    );
}
