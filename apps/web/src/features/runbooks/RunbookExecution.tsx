"use client";

import { useState } from 'react';
import type { Identity } from './hooks/useRunbooks';
import { useExecution } from './hooks/useRunbooks';
import { currentStep, missingEvidence, summarizeExecution } from './engine';
import type { RunbookStep } from './model';
import StepChecklist from './StepChecklist';
import EvidenceCapturePanel from './EvidenceCapturePanel';

export default function RunbookExecutionView({ id, identity }: { id: string; identity: Identity }) {
  const { execution, template, error, preview, act } = useExecution(id, identity);
  const [selected, setSelected] = useState<RunbookStep | null>(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  if (!execution || !template) return <p role="status" className="text-sm text-zinc-500">{error ?? 'Loading execution…'}</p>;

  const step = selected ?? currentStep(template, execution);
  const state = step ? execution.steps[step.id] : null;
  const summary = summarizeExecution(template, execution);
  const open = execution.status === 'in_progress';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{template.title} <span className="text-sm font-normal text-zinc-500">v{execution.templateVersion}</span></h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {summary.stepsCompleted}/{summary.stepsTotal} steps · {execution.status.replace('_', ' ')} · launched from {execution.context.source}
          {execution.context.refId ? ` ${execution.context.refId}` : ''}
        </p>
        <StepChecklist template={template} execution={execution} selectedId={step?.id ?? null} onSelect={setSelected} />
      </div>

      <div className="space-y-4">
        {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
        {step && state ? (
          <section aria-label={`Step: ${step.title}`} className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h2>
            {step.instructions && <p className="text-sm text-zinc-700 dark:text-zinc-300">{step.instructions}</p>}
            <EvidenceCapturePanel
              evidence={state.evidence}
              required={step.requiredEvidence ?? []}
              onAdd={(item) => void act({ action: 'evidence', stepId: step.id, ...item })}
            />
            {step.kind === 'decision' && state.status !== 'completed' && (
              <div role="group" aria-label="Decision" className="flex flex-wrap gap-2">
                {step.options?.map((o) => (
                  <button key={o} type="button" disabled={!open || missingEvidence(step, state).length > 0} onClick={() => void act({ action: 'complete', stepId: step.id, outcome: o, notes })} className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                    {o}
                  </button>
                ))}
              </div>
            )}
            {step.kind === 'automation' && state.status !== 'completed' && (
              <div className="space-y-2 text-sm">
                <button type="button" onClick={() => void act({ action: 'dry_run', stepId: step.id })} className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Dry run</button>
                {preview && <p role="status" className="rounded bg-zinc-100 p-2 dark:bg-zinc-800">{preview}</p>}
                {step.automation?.requiresApproval && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    Approval: {state.approval?.approvedBy ? `approved by ${state.approval.approvedBy}` : state.approval ? `requested by ${state.approval.requestedBy}` : 'required before running'}
                  </p>
                )}
                {step.automation?.requiresApproval && !state.approval && (
                  <button type="button" onClick={() => void act({ action: 'request_approval', stepId: step.id })} className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Request approval</button>
                )}
                {state.approval && !state.approval.approvedBy && identity.role === 'maintainer' && (
                  <button type="button" onClick={() => void act({ action: 'approve', stepId: step.id })} className="ml-2 rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Approve</button>
                )}
              </div>
            )}
            {step.kind !== 'decision' && state.status !== 'completed' && (
              <>
                <label className="block text-xs">
                  Notes
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!open} onClick={() => void act({ action: 'complete', stepId: step.id, notes })} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {step.kind === 'automation' ? 'Run & complete' : 'Mark complete'}
                  </button>
                  <input aria-label="Block reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Blocked because…" className="min-w-40 flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" />
                  <button type="button" disabled={!open || !reason.trim()} onClick={() => void act({ action: 'block', stepId: step.id, reason })} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40">Block</button>
                </div>
              </>
            )}
          </section>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">All steps are complete.</p>
        )}

        {execution.status === 'completed' && (
          <section aria-label="Summary" className="rounded-xl border border-emerald-300 p-4 text-sm dark:border-emerald-800">
            <h2 className="font-semibold">Post-execution summary</h2>
            <p>{summary.stepsCompleted}/{summary.stepsTotal} steps, {summary.evidenceCount} evidence item(s){summary.durationMs !== null ? `, ${Math.round(summary.durationMs / 60000)} min` : ''}.</p>
            {!execution.feedback ? (
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded border px-2 py-1" onClick={() => void act({ action: 'feedback', helpful: true, comment: '' })}>Helpful</button>
                <button type="button" className="rounded border px-2 py-1" onClick={() => void act({ action: 'feedback', helpful: false, comment: '' })}>Needs work</button>
              </div>
            ) : (
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">Feedback recorded: {execution.feedback.helpful ? 'helpful' : 'needs work'}.</p>
            )}
          </section>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Audit timeline ({execution.audit.length})</summary>
          <ol className="mt-2 space-y-1">
            {execution.audit.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <time dateTime={a.at}>{new Date(a.at).toLocaleTimeString()}</time> · {a.actor} · {a.type.replace('_', ' ')}{a.stepId ? ` (${a.stepId})` : ''}{a.detail ? ` – ${a.detail}` : ''}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}
