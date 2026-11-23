'use client';

/**
 * Rich Technical Report Editor (issue #2313).
 *
 * Markdown is the source of truth. The source pane edits that Markdown
 * directly; the preview pane renders it with react-markdown and maps reserved
 * fenced directives to accessible block components. All author content is
 * sanitized before rendering or export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { downloadTextFile } from '@/app/utils/browser-download';
import { useReportEditor } from './hooks/useReportEditor';
import {
  CalloutBlockDataSchema,
  EvidenceRefSchema,
  MermaidBlockDataSchema,
} from './lib/schema';
import {
  applyFormat,
  FORMAT_SHORTCUTS,
  TABLE_SNIPPET,
  type FormatAction,
} from './lib/format';
import { createChecklistSnippet } from './lib/checklist';
import { createCalloutBlock, createEvidenceBlock, createMermaidBlock, insertBlockAt } from './lib/markdown-blocks';
import {
  parseSlashCommand,
  SLASH_COMMANDS,
  isSlashCommandPrefix,
  type SlashCommand,
} from './lib/slash-commands';
import {
  exportReport,
  type ReportExportFormat,
} from './lib/export';
import {
  reportPlainText,
  safeReportUrl,
  sanitizeReportMarkdown,
} from './lib/sanitize';
import { createEvidenceRef } from './lib/embeds';
import { isTemplateId, listTemplates } from './templates';
import type { CalloutVariant, EntitySnapshot, EvidenceRef } from './lib/types';
import { EvidenceEmbed } from './blocks/EvidenceEmbed';
import { MermaidBlock } from './blocks/MermaidBlock';
import { CalloutBlock } from './blocks/CalloutBlock';
import { ChecklistBlock } from './blocks/ChecklistBlock';
import { DiffView, VersionHistoryPanel } from './history';
import type { RevisionComparison } from './lib/revision';

interface TechnicalReportEditorProps {
  reportId: string;
}

type ViewMode = 'source' | 'preview';
type SidebarTab = 'templates' | 'history' | 'comments' | 'checklist' | 'export';

interface SlashContext {
  start: number;
  length: number;
  line: string;
}

const CALLOUT_VARIANTS: readonly CalloutVariant[] = ['info', 'warning', 'success', 'danger'];

function parseJsonPayload(children: ReactNode): unknown {
  try {
    return JSON.parse(String(children ?? ''));
  } catch {
    return null;
  }
}

function currentLineAt(text: string, caret: number): SlashContext {
  const start = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const nextBreak = text.indexOf('\n', caret);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return { start, length: end - start, line: text.slice(start, end) };
}

export function TechnicalReportEditor({ reportId }: TechnicalReportEditorProps) {
  const editor = useReportEditor({ reportId });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [view, setView] = useState<ViewMode>('source');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('templates');
  const [slash, setSlash] = useState<SlashContext | null>(null);
  const [comparison, setComparison] = useState<RevisionComparison | null>(null);
  const [commentAnchor, setCommentAnchor] = useState('document');
  const [commentBody, setCommentBody] = useState('');
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>('markdown');
  const [exporting, setExporting] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, EntitySnapshot | null>>({});

  const document = editor.document;
  const { resolveSnapshots, setEvidenceMode } = editor;

  useEffect(() => {
    let active = true;
    void resolveSnapshots().then((resolved) => {
      if (active) setSnapshots(resolved);
    });
    return () => { active = false; };
  }, [resolveSnapshots, document.embeds]);

  const safeMarkdown = useMemo(() => sanitizeReportMarkdown(document.markdown), [document.markdown]);

  const previewComponents = useMemo<Components>(() => ({
    pre: ({ children }) => <>{children}</>,
    input: ({ checked }) => (
      <input type="checkbox" checked={Boolean(checked)} disabled readOnly aria-label="Checklist item (read-only in preview)" />
    ),
    a: ({ children, href }) => (
      <a href={safeReportUrl(href ?? '#')} rel="noopener noreferrer" target="_blank" className="link">
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const language = /language-([a-zA-Z0-9_-]+)/.exec(className ?? '')?.[1];
      const payload = parseJsonPayload(children);
      if (language === 'report-evidence') {
        const parsed = EvidenceRefSchema.safeParse(payload);
        if (parsed.success) {
          const reference = document.embeds[parsed.data.id] ?? parsed.data;
          return (
            <EvidenceEmbed
              reference={reference}
              onPin={(snapshot: EntitySnapshot) => setEvidenceMode(reference.id, snapshot)}
              onUnpin={() => setEvidenceMode(reference.id)}
            />
          );
        }
      }
      if (language === 'report-mermaid') {
        const parsed = MermaidBlockDataSchema.safeParse(payload);
        if (parsed.success) return <MermaidBlock data={parsed.data} />;
      }
      if (language === 'report-callout') {
        const parsed = CalloutBlockDataSchema.safeParse(payload);
        if (parsed.success) return <CalloutBlock data={parsed.data} />;
      }
      const text = String(children ?? '');
      const isBlock = Boolean(language) || text.includes('\n');
      if (!isBlock) {
        return <code className="rounded px-1.5 py-0.5 font-mono text-xs" style={{ background: 'var(--chip-bg)' }}>{children}</code>;
      }
      return (
        <pre className="my-4 overflow-x-auto rounded-xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', background: 'var(--surface)' }}>
          <code className="font-mono">{text}</code>
        </pre>
      );
    },
  }), [document.embeds, setEvidenceMode]);

  const focusSelection = useCallback((start: number, end: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }, []);

  const runFormat = useCallback((action: FormatAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyFormat(document.markdown, textarea.selectionStart, textarea.selectionEnd, action);
    editor.setMarkdown(result.text);
    editor.announce(`${action} formatting applied.`);
    focusSelection(result.start, result.end);
  }, [document.markdown, editor, focusSelection]);

  const executeSlashCommand = useCallback((command: SlashCommand, context: SlashContext) => {
    const before = document.markdown.slice(0, context.start);
    const after = document.markdown.slice(context.start + context.length);
    const base = before + after;

    if (command.command === 'template') {
      const templateId = command.args[0] ?? 'postmortem';
      if (!isTemplateId(templateId)) {
        editor.announce(`Unknown template ${templateId}.`);
        return;
      }
      editor.replaceWithTemplate(templateId, 'replace');
      setSlash(null);
      return;
    }

    let snippet = '';
    let newReference: EvidenceRef | null = null;
    if (command.command === 'evidence') {
      const type = command.args[0] ?? 'run';
      const entityId = command.args[1] ?? 'run-001';
      if (!['run', 'crash', 'trace', 'log', 'state-diff', 'chart', 'artifact'].includes(type)) {
        editor.announce(`Unknown evidence type ${type}.`);
        return;
      }
      const reference = createEvidenceRef(type as Parameters<typeof createEvidenceRef>[0], entityId);
      newReference = reference;
      snippet = createEvidenceBlock(reference).source;
    } else if (command.command === 'mermaid') {
      snippet = createMermaidBlock({
        id: `mermaid-${Date.now().toString(36)}`,
        code: 'flowchart TD\n  A[Repro] --> B{Expected?}\n  B -- no --> C[Attach evidence]',
        caption: command.args.join(' ') || undefined,
      }).source;
    } else if (command.command === 'callout') {
      const variant = CALLOUT_VARIANTS.includes(command.args[0] as CalloutVariant)
        ? (command.args[0] as CalloutVariant)
        : 'info';
      snippet = createCalloutBlock({
        id: `callout-${Date.now().toString(36)}`,
        variant,
        title: command.args.slice(1).join(' ') || variant.charAt(0).toUpperCase() + variant.slice(1),
        body: 'Add the detail reviewers need to understand this section.',
      }).source;
    } else if (command.command === 'table') {
      snippet = TABLE_SNIPPET;
    } else {
      snippet = createChecklistSnippet();
    }

    const result = insertBlockAt(base, before.length, snippet);
    editor.updateDocument((current) => {
      const nextMarkdown = result.markdown;
      return {
        ...current,
        markdown: nextMarkdown,
        embeds: newReference
          ? { ...current.embeds, [newReference.id]: newReference }
          : current.embeds,
      };
    });
    focusSelection(result.caret, result.caret);
    editor.announce(`${command.command} block inserted.`);
    setSlash(null);
  }, [document.markdown, editor, focusSelection]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.ctrlKey || event.metaKey;
    const shortcuts: Record<string, FormatAction> = {
      b: 'bold',
      i: 'italic',
      k: 'link',
      e: 'code',
      H: 'heading',
      L: 'list',
      Q: 'quote',
      T: 'table',
      C: 'code-block',
    };
    if (modifier) {
      const key = event.shiftKey ? event.key.toUpperCase() : event.key.toLowerCase();
      const action = shortcuts[key];
      if (action) {
        event.preventDefault();
        runFormat(action);
      }
      return;
    }
    if (event.key === 'Escape') {
      setSlash(null);
      return;
    }
    if (event.key === 'Enter') {
      const textarea = event.currentTarget;
      const context = currentLineAt(textarea.value, textarea.selectionStart);
      const command = parseSlashCommand(context.line);
      if (command) {
        event.preventDefault();
        executeSlashCommand(command, context);
      }
    }
  }, [executeSlashCommand, runFormat]);

  const handleSourceChange = useCallback((value: string, caret: number) => {
    editor.setMarkdown(value);
    const context = currentLineAt(value, caret);
    setSlash(isSlashCommandPrefix(context.line) ? context : null);
  }, [editor]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const resolved = await editor.resolveSnapshots();
      const content = exportReport(editor.document, exportFormat, { snapshots: resolved });
      const extension = exportFormat === 'markdown' ? 'md' : 'html';
      const mime = exportFormat === 'markdown' ? 'text/markdown' : 'text/html';
      downloadTextFile(content, `report-${reportId}.${extension}`, mime);
      editor.announce(`Exported report as ${exportFormat}.`);
    } finally {
      setExporting(false);
    }
  }, [editor, exportFormat, reportId]);

  const tabs: ReadonlyArray<{ id: SidebarTab; label: string }> = [
    { id: 'templates', label: 'Templates' },
    { id: 'history', label: 'History' },
    { id: 'comments', label: 'Comments' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'export', label: 'Export' },
  ];

  const statusColor = editor.status === 'conflict' || editor.status === 'error'
    ? '#b42318'
    : editor.status === 'offline'
      ? '#dc6803'
      : 'var(--text-secondary)';

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{editor.announcement}</div>

      <header className="card rounded-2xl p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <label className="input-label" htmlFor="report-title">Report title</label>
            <input
              id="report-title"
              className="input-field w-full"
              value={document.title}
              onChange={(event) => editor.setTitle(event.target.value)}
              disabled={!editor.hydrated}
              maxLength={300}
            />
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Report <code>{reportId}</code> · revision r{document.revision} · {document.comments.filter((comment) => !comment.resolved).length} open comments
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="chip" aria-label={`Save status: ${editor.status}`}>{editor.status}</div>
            {editor.queueCount > 0 && <div className="chip">{editor.queueCount} queued</div>}
            <button type="button" className="btn-outline text-xs" onClick={() => void editor.saveVersion('Manual version')}>
              Save version
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => void editor.saveNow()}>
              Save now
            </button>
          </div>
        </div>

        <p role="status" className="mt-3 text-xs" style={{ color: statusColor }}>
          {editor.message}
        </p>
      </header>

      {editor.conflict && (
        <section role="alert" className="rounded-xl border p-4 text-sm" style={{ borderColor: '#b42318', background: 'rgba(180, 35, 24, 0.08)' }}>
          <h2 className="font-semibold">Revision conflict: {editor.conflict.reason}</h2>
          <p className="mt-1 text-xs">Another save advanced this report. Choose which version to keep.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-outline text-xs" onClick={editor.acceptRemote}>Load remote revision</button>
            <button type="button" className="btn-primary text-xs" onClick={() => void editor.overwriteWithLocal()}>Overwrite with local copy</button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card rounded-2xl" aria-label="Report editor">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Markdown formatting">
              {FORMAT_SHORTCUTS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className="chip text-xs disabled:opacity-40"
                  title={`${item.label} (${item.keys})`}
                  aria-label={`${item.label}, shortcut ${item.keys}`}
                  disabled={!editor.hydrated || view !== 'source'}
                  onClick={() => runFormat(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1" role="tablist" aria-label="Editor view">
              {(['source', 'preview'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  className="chip text-xs capitalize"
                  onClick={() => setView(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 md:p-4">
            {view === 'source' ? (
              <div className="relative">
                <label className="sr-only" htmlFor="report-markdown">Report Markdown source</label>
                <textarea
                  id="report-markdown"
                  ref={textareaRef}
                  value={document.markdown}
                  disabled={!editor.hydrated}
                  onChange={(event) => handleSourceChange(event.target.value, event.target.selectionStart)}
                  onKeyDown={handleKeyDown}
                  spellCheck
                  aria-describedby="editor-help"
                  className="input-field min-h-[560px] w-full resize-y font-mono text-xs leading-relaxed"
                />
                {slash && (
                  <div className="absolute bottom-4 left-4 z-10 max-h-64 w-80 overflow-auto rounded-xl border p-2 shadow-lg" style={{ borderColor: 'var(--border-color)', background: 'var(--surface)' }} role="listbox" aria-label="Slash commands">
                    {SLASH_COMMANDS.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="block w-full rounded p-2 text-left text-xs hover:bg-zinc-500/10"
                        onClick={() => {
                          const command = parseSlashCommand(`/${item.name}`);
                          if (command) executeSlashCommand(command, slash);
                        }}
                      >
                        <code>/{item.name}</code>
                        <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{item.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p id="editor-help" className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Type <code>/</code> for blocks and templates. Shortcuts: Ctrl+B/I/K/E, Ctrl+Shift+H/L/Q/T/C.
                  Autosaves locally, then to the server. {editor.queueCount > 0 && `${editor.queueCount} save(s) queued.`}
                </p>
              </div>
            ) : (
              <div role="tabpanel" aria-label="Rendered report preview" className="min-h-[560px] rounded-xl border p-4 md:p-6" style={{ borderColor: 'var(--border-color)', background: 'var(--surface)' }}>
                {safeMarkdown.trim() ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={previewComponents}
                      urlTransform={safeReportUrl}
                    >
                      {safeMarkdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="card rounded-2xl p-3 md:p-4" aria-label="Report tools">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Report tool panels">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sidebarTab === tab.id}
                className="chip text-xs"
                onClick={() => setSidebarTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4" role="tabpanel" aria-label={`${sidebarTab} panel`}>
            {sidebarTab === 'templates' && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Applying a template replaces the current source. This is deterministic.
                </p>
                {listTemplates().map((template) => (
                  <div key={template.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)' }}>
                    <h3 className="text-sm font-semibold">{template.title}</h3>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{template.description}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn-outline text-xs" onClick={() => editor.replaceWithTemplate(template.id, 'replace')}>Replace</button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => editor.replaceWithTemplate(template.id, 'append')}>Append</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sidebarTab === 'history' && (
              <div className="space-y-4">
                <VersionHistoryPanel
                  revisions={editor.revisions}
                  currentRevision={document.revision}
                  onSaveVersion={(message) => void editor.saveVersion(message)}
                  onRestore={(revision) => void editor.restoreRevision(revision)}
                  onCompare={(left, right) => setComparison(editor.compare(left, right))}
                />
                {comparison && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Diff r{comparison.left?.revision ?? '?'} → r{comparison.right?.revision ?? '?'}</h3>
                    <DiffView diff={comparison.diff} />
                  </div>
                )}
              </div>
            )}

            {sidebarTab === 'comments' && (
              <div className="space-y-4">
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!commentBody.trim()) return;
                    editor.addComment(commentAnchor.trim() || 'document', commentBody.trim());
                    setCommentBody('');
                  }}
                >
                  <label className="input-label" htmlFor="comment-anchor">Anchor</label>
                  <input id="comment-anchor" className="input-field" value={commentAnchor} onChange={(event) => setCommentAnchor(event.target.value)} maxLength={500} />
                  <label className="input-label" htmlFor="comment-body">Comment (use @handle to mention)</label>
                  <textarea id="comment-body" className="input-field min-h-24" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={4000} />
                  <button type="submit" className="btn-outline text-xs">Add comment</button>
                </form>
                <ul className="space-y-2" role="list" aria-label="Inline comments">
                  {document.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border-color)', opacity: comment.resolved ? 0.6 : 1 }}>
                      <p className="font-semibold">{comment.author} on {reportPlainText(comment.anchor)}</p>
                      <p className="mt-1">{reportPlainText(comment.body)}</p>
                      {comment.mentions.length > 0 && (
                        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Mentions: {comment.mentions.join(', ')}</p>
                      )}
                      {!comment.resolved && (
                        <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => editor.resolveComment(comment.id)}>Resolve</button>
                      )}
                    </li>
                  ))}
                  {document.comments.length === 0 && <li className="text-xs" style={{ color: 'var(--text-secondary)' }}>No comments yet.</li>}
                </ul>
              </div>
            )}

            {sidebarTab === 'checklist' && (
              <div>
                <p className="mb-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Checklist state lives in Markdown, so it is versioned with the report.
                </p>
                <ChecklistBlock markdown={document.markdown} onToggle={editor.toggleChecklist} />
                <button type="button" className="btn-outline text-xs" onClick={() => editor.insertAt(createChecklistSnippet(), document.markdown.length)}>
                  Insert checklist
                </button>
              </div>
            )}

            {sidebarTab === 'export' && (
              <div className="space-y-3">
                <label className="input-label" htmlFor="export-format">Export format</label>
                <select id="export-format" className="input-field" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ReportExportFormat)}>
                  <option value="markdown">Markdown (.md)</option>
                  <option value="html">HTML (.html)</option>
                  <option value="pdf-html">PDF-ready HTML (.html)</option>
                </select>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Exports resolve live evidence snapshots captured at export time, keep pinned snapshots, and redact secrets by default.
                  {Object.keys(snapshots).length > 0 && ` ${Object.keys(snapshots).length} embed(s) resolved.`}
                </p>
                <button type="button" className="btn-primary text-xs" onClick={() => void handleExport()} disabled={exporting}>
                  {exporting ? 'Preparing…' : 'Download export'}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
