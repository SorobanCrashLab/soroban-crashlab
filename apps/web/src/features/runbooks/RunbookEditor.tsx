"use client";

import { useState } from 'react';
import { validateTemplate } from './engine';
import type { EvidenceKind, RunbookStep, StepKind } from './model';
import type { Identity } from './hooks/useRunbooks';

const EVIDENCE: EvidenceKind[] = ['log', 'trace', 'diff', 'artifact', 'screenshot', 'note'];

function blankStep(n: number): RunbookStep {
  return { id: `step-${n}`, title: '', instructions: '', kind: 'manual' };
}

/** Template editor: validates locally with the same rules the API enforces. */
export default function RunbookEditor({ identity, onSaved }: { identity: Identity; onSaved?: () => void }) {
  const [title, setTitle] = useState('');
  const [failureType, setFailureType] = useState('general');
  const [service, setService] = useState('general');
  const [steps, setSteps] = useState<RunbookStep[]>([blankStep(1)]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const patch = (i: number, p: Partial<RunbookStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  if (identity.role !== 'maintainer') {
    return <p className="text-sm text-zinc-600 dark:text-zinc-300">Only maintainers can author runbook templates.</p>;
  }

  return (
    <form
      aria-label="Runbook editor"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const found = validateTemplate({ title, steps });
        setProblems(found);
        if (found.length) return;
        const res = await fetch('/api/runbooks', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-crashlab-user': identity.user, 'x-crashlab-role': identity.role },
          body: JSON.stringify({ title, failureType, service, steps }),
        });
        if (res.ok) {
          setSaved(true);
          onSaved?.();
        } else setProblems([(await res.json()).error ?? 'Save failed']);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <label className="flex flex-col gap-1">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
        <label className="flex flex-col gap-1">Failure type<input value={failureType} onChange={(e) => setFailureType(e.target.value)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
        <label className="flex flex-col gap-1">Service<input value={service} onChange={(e) => setService(e.target.value)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1">Id<input value={step.id} onChange={(e) => patch(i, { id: e.target.value })} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
              <label className="flex flex-col gap-1 sm:col-span-2">Title<input value={step.title} onChange={(e) => patch(i, { title: e.target.value })} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
              <label className="flex flex-col gap-1">Kind
                <select value={step.kind} onChange={(e) => patch(i, { kind: e.target.value as StepKind, options: e.target.value === 'decision' ? ['yes', 'no'] : undefined, automation: e.target.value === 'automation' ? { action: 'notify', requiresApproval: false } : undefined })} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
                  <option value="manual">manual</option><option value="decision">decision</option><option value="automation">automation</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">Instructions<textarea rows={2} value={step.instructions} onChange={(e) => patch(i, { instructions: e.target.value })} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" /></label>
            <fieldset className="flex flex-wrap gap-3 text-xs">
              <legend className="mb-1">Required evidence</legend>
              {EVIDENCE.map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="checkbox" checked={step.requiredEvidence?.includes(k) ?? false} onChange={(e) => patch(i, { requiredEvidence: e.target.checked ? [...(step.requiredEvidence ?? []), k] : (step.requiredEvidence ?? []).filter((x) => x !== k) })} />
                  {k}
                </label>
              ))}
            </fieldset>
            {steps.length > 1 && <button type="button" onClick={() => setSteps((s) => s.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline dark:text-red-300">Remove step</button>}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button type="button" onClick={() => setSteps((s) => [...s, blankStep(s.length + 1)])} className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Add step</button>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save draft</button>
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-700 dark:text-red-300">{problems.map((p) => (<li key={p}>{p}</li>))}</ul>
      )}
      {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Draft saved. A maintainer must approve it before it can be executed.</p>}
    </form>
  );
}
