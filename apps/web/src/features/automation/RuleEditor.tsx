'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ACTION_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  MAX_RULE_ACTIONS,
  MAX_RULE_CONDITIONS,
  SAMPLE_EVENTS,
  WORKFLOW_TRIGGERS,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowRule,
  type WorkflowRuleStatus,
  type WorkflowTrigger,
} from '@/lib/automation/rules';

type RuleResponse = { data?: { rule: WorkflowRule }; error?: string };
type SimulationResponse = {
  data?: { result: { matched: boolean; explanation: string; eventId: string; ruleVersion: number; actionsPlanned: WorkflowAction[]; sideEffectsPerformed: false } };
  error?: string;
};

const NEW_RULE = 'new';

function isWorkflowTrigger(value: string): value is WorkflowTrigger {
  return WORKFLOW_TRIGGERS.some((trigger) => trigger.id === value);
}

function isConditionField(value: string): value is WorkflowCondition['field'] {
  return (CONDITION_FIELDS as readonly string[]).includes(value);
}

function isConditionOperator(value: string): value is WorkflowCondition['operator'] {
  return (CONDITION_OPERATORS as readonly string[]).includes(value);
}

function isActionType(value: string): value is WorkflowActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

export default function RuleEditor({ ruleId }: { ruleId: string }) {
  const router = useRouter();
  const isNew = ruleId === NEW_RULE;
  const [rule, setRule] = useState<WorkflowRule | null>(null);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<WorkflowTrigger>('crash.created');
  const [conditions, setConditions] = useState<WorkflowCondition[]>([
    { field: 'severity', operator: 'equals', value: 'critical' },
  ]);
  const [actions, setActions] = useState<WorkflowAction[]>([{ type: 'notify', value: 'On-call team' }]);
  const [sampleEventId, setSampleEventId] = useState<string>(SAMPLE_EVENTS[0].id);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse['data'] | null>(null);
  const hasUnsavedChanges = Boolean(rule) && JSON.stringify({
    name,
    trigger,
    conditions,
    actions,
  }) !== JSON.stringify({
    name: rule?.name,
    trigger: rule?.trigger,
    conditions: rule?.conditions,
    actions: rule?.actions,
  });

  useEffect(() => {
    if (isNew) return;
    let active = true;
    const loadRule = async () => {
      try {
        const response = await fetch(`/api/automation/rules/${encodeURIComponent(ruleId)}`);
        const payload = await response.json() as RuleResponse;
        if (!response.ok || !payload.data?.rule) throw new Error(payload.error ?? 'Unable to load this workflow rule.');
        if (active) {
          const current = payload.data.rule;
          setRule(current);
          setName(current.name);
          setTrigger(current.trigger);
          setConditions(current.conditions);
          setActions(current.actions);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load this workflow rule.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRule();
    return () => { active = false; };
  }, [isNew, ruleId]);

  function updateCondition(index: number, patch: Partial<WorkflowCondition>) {
    setConditions((current) => current.map((condition, itemIndex) => {
      if (itemIndex !== index) return condition;
      const next = { ...condition, ...patch };
      if (next.field === 'count' && typeof next.value !== 'number') next.value = 1;
      if (next.field !== 'count' && typeof next.value === 'number') next.value = String(next.value);
      if (next.field !== 'count' && ['greater-than', 'less-than'].includes(next.operator)) {
        next.operator = 'equals';
      }
      return next;
    }));
  }

  async function save(status: WorkflowRuleStatus = 'draft') {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const ruleData = {
        name,
        trigger,
        conditions,
        actions,
        ...(!isNew ? { status } : {}),
      };
      const response = await fetch(
        isNew ? '/api/automation/rules' : `/api/automation/rules/${encodeURIComponent(ruleId)}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        },
      );
      const payload = await response.json() as RuleResponse;
      if (!response.ok || !payload.data?.rule) throw new Error(payload.error ?? 'Unable to save workflow rule.');
      setRule(payload.data.rule);
      setNotice(isNew ? 'Draft created.' : `Rule saved as ${payload.data.rule.status}.`);
      if (isNew) router.replace(`/automation/${payload.data.rule.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save workflow rule.');
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    if (!rule) {
      setError('Save the draft before running a simulation.');
      return;
    }
    if (hasUnsavedChanges) {
      setError('Save your changes before simulating. The simulation uses the latest saved version.');
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/automation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, eventId: sampleEventId }),
      });
      const payload = await response.json() as SimulationResponse;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? 'Unable to simulate this workflow rule.');
      setSimulation(payload.data);
      setNotice('Simulation recorded. No actions were dispatched.');
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'Unable to simulate this workflow rule.');
    }
  }

  async function deleteRule() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/automation/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to delete workflow rule.');
      router.replace('/automation');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete workflow rule.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function restoreVersion(snapshot: WorkflowRule['versions'][number]['snapshot']) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/automation/rules/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const payload = await response.json() as RuleResponse;
      if (!response.ok || !payload.data?.rule) throw new Error(payload.error ?? 'Unable to restore this version.');
      const restored = payload.data.rule;
      setRule(restored);
      setName(restored.name);
      setTrigger(restored.trigger);
      setConditions(restored.conditions);
      setActions(restored.actions);
      setNotice(`Restored as version ${restored.version}.`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore this version.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-4xl p-6 text-sm text-zinc-500">Loading workflow rule…</main>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <Link href="/automation" className="text-sm font-medium text-purple-700 hover:underline dark:text-purple-300">← All rules</Link>
        <h1 className="mt-4 text-3xl font-bold text-zinc-900 dark:text-white">{isNew ? 'Create workflow rule' : name || 'Edit workflow rule'}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure a trigger, conditions, and planned actions. Simulation never performs side effects.
        </p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      <section className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Rule name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">1. Trigger</legend>
          <label htmlFor="workflow-trigger" className="sr-only">Select trigger</label>
          <select id="workflow-trigger" value={trigger} onChange={(event) => {
            if (isWorkflowTrigger(event.target.value)) setTrigger(event.target.value);
          }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            {WORKFLOW_TRIGGERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">2. Conditions (all must match)</legend>
          {conditions.map((condition, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="sr-only" htmlFor={`condition-field-${index}`}>Condition field</label>
              <select id={`condition-field-${index}`} value={condition.field} onChange={(event) => {
                if (isConditionField(event.target.value)) updateCondition(index, { field: event.target.value });
              }} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {CONDITION_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
              <label className="sr-only" htmlFor={`condition-operator-${index}`}>Condition operator</label>
              <select id={`condition-operator-${index}`} value={condition.operator} onChange={(event) => {
                if (isConditionOperator(event.target.value)) updateCondition(index, { operator: event.target.value });
              }} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {CONDITION_OPERATORS.filter((operator) => condition.field === 'count' || !['greater-than', 'less-than'].includes(operator)).map((operator) => <option key={operator} value={operator}>{operator}</option>)}
              </select>
              <label className="sr-only" htmlFor={`condition-value-${index}`}>Condition value</label>
              <input id={`condition-value-${index}`} type={condition.field === 'count' ? 'number' : 'text'} value={condition.value} onChange={(event) => updateCondition(index, { value: condition.field === 'count' ? Number(event.target.value) : event.target.value })} className="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
              <button type="button" onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={conditions.length === 1} aria-label={`Remove condition ${index + 1}`} className="rounded-md px-2 text-sm text-rose-700 disabled:opacity-40 dark:text-rose-300">Remove</button>
            </div>
          ))}
          <button type="button" disabled={conditions.length >= MAX_RULE_CONDITIONS} onClick={() => setConditions((current) => [...current, { field: 'severity', operator: 'equals', value: 'high' }])} className="text-sm font-medium text-purple-700 hover:underline disabled:opacity-50 dark:text-purple-300">+ Add condition</button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">3. Actions (planned only)</legend>
          {actions.map((action, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="sr-only" htmlFor={`action-type-${index}`}>Action type</label>
              <select id={`action-type-${index}`} value={action.type} onChange={(event) => {
                const actionType = event.target.value;
                if (isActionType(actionType)) setActions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: actionType } : item));
              }} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <label className="sr-only" htmlFor={`action-value-${index}`}>Action detail</label>
              <input id={`action-value-${index}`} value={action.value} maxLength={120} onChange={(event) => setActions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
              <button type="button" onClick={() => setActions((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={actions.length === 1} aria-label={`Remove action ${index + 1}`} className="rounded-md px-2 text-sm text-rose-700 disabled:opacity-40 dark:text-rose-300">Remove</button>
            </div>
          ))}
          <button type="button" disabled={actions.length >= MAX_RULE_ACTIONS} onClick={() => setActions((current) => [...current, { type: 'notify', value: 'Operations team' }])} className="text-sm font-medium text-purple-700 hover:underline disabled:opacity-50 dark:text-purple-300">+ Add action</button>
        </fieldset>

        <div className="flex flex-wrap gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <button type="button" onClick={() => void save('draft')} disabled={saving} className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>
          {!isNew && (
            <>
              <button type="button" onClick={() => void save('enabled')} disabled={saving} className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40">Mark enabled</button>
              <button type="button" onClick={() => void save('paused')} disabled={saving} className="rounded-lg border border-zinc-400 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">Pause</button>
            </>
          )}
        </div>

        {!isNew && rule && (
          <section className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-labelledby="simulate-heading">
            <h2 id="simulate-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dry-run simulation</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Save changes before simulating; only the latest saved version is evaluated.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="sample-event" className="sr-only">Sample event</label>
              <select id="sample-event" value={sampleEventId} onChange={(event) => setSampleEventId(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {SAMPLE_EVENTS.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}
              </select>
              <button type="button" onClick={() => void simulate()} className="rounded-lg border border-purple-600 px-4 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/40">Simulate</button>
              <Link href="/automation/executions" className="self-center text-sm text-zinc-700 hover:underline dark:text-zinc-300">View simulation history</Link>
            </div>
            {simulation && !hasUnsavedChanges && simulation.result.ruleVersion === rule.version && (
              <div role="status" className="rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{simulation.result.matched ? 'Rule matched' : 'Rule did not match'}</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{simulation.result.explanation}</p>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">Actions planned: {simulation.result.actionsPlanned.length}. Side effects performed: no.</p>
              </div>
            )}
          </section>
        )}
      </section>

      {rule && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="versions-heading">
          <h2 id="versions-heading" className="font-semibold text-zinc-900 dark:text-white">Version history</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Current version v{rule.version}, updated by {rule.updatedBy}.</p>
          {rule.versions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No earlier versions.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {[...rule.versions].reverse().map((version) => (
                <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span>v{version.version} · {new Date(version.savedAt).toLocaleString()} · {version.actor} · {version.snapshot.name} ({version.snapshot.status})</span>
                  <button type="button" onClick={() => void restoreVersion(version.snapshot)} disabled={saving} className="font-medium text-purple-700 hover:underline disabled:opacity-50 dark:text-purple-300">Restore as new version</button>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-semibold text-rose-700 hover:underline dark:text-rose-300">Delete rule</button>
            ) : (
              <div role="group" aria-labelledby="delete-rule-title" className="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                <p id="delete-rule-title" className="text-sm font-medium text-rose-950 dark:text-rose-200">Delete “{rule.name}”? This cannot be undone.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => void deleteRule()} disabled={deleting} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Confirm delete'}</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="rounded-md border border-zinc-400 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
