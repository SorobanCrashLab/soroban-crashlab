"use client";

import type { RunbookExecution, RunbookStep, RunbookTemplate } from './model';
import { applicableSteps, currentStep } from './engine';

const STATUS_LABEL: Record<string, string> = {
  pending: 'To do',
  in_progress: 'In progress',
  completed: 'Done',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

/** Accessible ordered checklist; the active step is marked aria-current="step". */
export default function StepChecklist({
  template,
  execution,
  selectedId,
  onSelect,
}: {
  template: RunbookTemplate;
  execution: RunbookExecution;
  selectedId: string | null;
  onSelect: (step: RunbookStep) => void;
}) {
  const steps = applicableSteps(template, execution);
  const active = currentStep(template, execution);
  return (
    <ol className="space-y-2" aria-label="Runbook steps">
      {steps.map((step, i) => {
        const state = execution.steps[step.id];
        const isActive = active?.id === step.id;
        return (
          <li key={step.id}>
            <button
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onSelect(step)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                selectedId === step.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <span aria-hidden="true" className="mt-0.5 font-mono text-xs text-zinc-500">{i + 1}.</span>
              <span className="flex-1">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{step.title}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {step.kind}
                  {step.slaMinutes ? ` · target ${step.slaMinutes} min` : ''}
                  {state.blockedReason ? ` · ${state.blockedReason}` : ''}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${state.status === 'completed' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : state.status === 'blocked' ? 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`}>
                {STATUS_LABEL[state.status]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
