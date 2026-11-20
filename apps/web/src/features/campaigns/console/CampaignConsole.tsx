'use client';

/**
 * Campaign management console (#2258): a single surface for list/filter,
 * saved views, templates, the wizard/editor, scheduling, budgets, lifecycle
 * actions and bulk operations. Loaded lazily by the campaign detail page.
 */

import { useMemo, useState } from 'react';
import {
  BUILTIN_TEMPLATES,
  DEFAULT_DRAFT,
  applyTemplate,
  duplicateTemplate,
  isDraftValid,
  validateDraft,
  type CampaignDraft,
} from './campaign-validation';
import {
  DEFAULT_SCHEDULE,
  describeSchedule,
  nextRunAfter,
  validateSchedule,
  type ScheduleConfig,
} from './campaign-schedule';
import {
  UNLIMITED_BUDGET,
  evaluateBudget,
  formatStroops,
  validateBudget,
  type CampaignBudget,
} from './campaign-budget';
import {
  CAMPAIGN_STATES,
  canManage,
  lifecycleAuditAction,
  startOptimisticAction,
  type CampaignRole,
  type LifecycleSnapshot,
} from './campaign-lifecycle';
import {
  DEFAULT_FILTER,
  filterCampaigns,
  selectVisible,
  toggleBulkSelection,
  type CampaignListItem,
  type CampaignFilter,
} from './campaign-list';

export interface CampaignConsoleProps {
  campaignId: string;
  role?: CampaignRole;
  campaigns?: readonly CampaignListItem[];
}

const TABS = ['list', 'builder', 'templates', 'schedule', 'budget', 'lifecycle'] as const;
type Tab = (typeof TABS)[number];

export default function CampaignConsole({
  campaignId,
  role = 'viewer',
  campaigns = [],
}: CampaignConsoleProps) {
  const [tab, setTab] = useState<Tab>('list');
  const [draft, setDraft] = useState<CampaignDraft>({ ...DEFAULT_DRAFT });
  const [schedule, setSchedule] = useState<ScheduleConfig>({ ...DEFAULT_SCHEDULE });
  const [budget, setBudget] = useState<CampaignBudget>({ ...UNLIMITED_BUDGET });
  const [filter, setFilter] = useState<CampaignFilter>(DEFAULT_FILTER);
  const [selected, setSelected] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<LifecycleSnapshot>({
    state: 'draft',
    scheduleId: null,
    updatedAt: '2026-01-01T00:00:00Z',
  });
  const [lastAudit, setLastAudit] = useState<string>('none');

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const scheduleError = useMemo(() => validateSchedule(schedule), [schedule]);
  const budgetError = useMemo(() => validateBudget(budget), [budget]);
  const visible = useMemo(() => filterCampaigns(campaigns, filter), [campaigns, filter]);
  const [previewNow] = useState(() => Date.now());
  const nextRun = useMemo(() => {
    if (scheduleError) return null;
    const run = nextRunAfter(schedule, previewNow);
    return run === null ? null : new Date(run).toISOString();
  }, [schedule, scheduleError, previewNow]);

  function updateDraft<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyState(target: LifecycleSnapshot['state'], at: string, actionId: string) {
    const action = { type: target, actor: role, at };
    const result = startOptimisticAction(snapshot, action, actionId);
    setSnapshot(result.snapshot);
    if (result.snapshot !== snapshot) setLastAudit(lifecycleAuditAction(action));
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 dark:border-zinc-800" aria-labelledby="campaign-console-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div>
          <h2 id="campaign-console-heading" className="text-lg font-semibold">Campaign console</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {campaignId} · {snapshot.state} · last audit: {lastAudit}
          </p>
        </div>
        <div role="tablist" aria-label="Campaign console sections" className="flex flex-wrap gap-1">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              aria-controls={`campaign-console-${entry}`}
              onClick={() => setTab(entry)}
              className={`rounded px-3 py-1.5 text-xs capitalize ${tab === entry ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
            >
              {entry}
            </button>
          ))}
        </div>
      </header>

      <div id={`campaign-console-${tab}`} role="tabpanel" className="p-5">
        {tab === 'list' && (
          <div>
            <label className="mb-3 block text-xs">
              <span className="sr-only">Filter campaigns</span>
              <input
                type="search"
                value={filter.query}
                onChange={(event) => setFilter({ ...filter, query: event.target.value })}
                placeholder="Filter by name or id"
                className="w-full max-w-sm rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
              />
            </label>
            <div className="mb-3 flex gap-2 text-xs">
              <button type="button" onClick={() => setSelected(selectVisible(selected, visible))} className="btn-outline text-xs">
                Select visible ({visible.length})
              </button>
              <button type="button" onClick={() => setSelected([])} disabled={selected.length === 0} className="btn-outline text-xs disabled:opacity-40">
                Clear ({selected.length})
              </button>
            </div>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
              {visible.length === 0 && <li className="py-4 text-zinc-500">No campaigns match this view.</li>}
              {visible.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => setSelected(toggleBulkSelection(selected, item.id))}
                    aria-label={`Select campaign ${item.name}`}
                  />
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{item.state}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'builder' && (
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <label>Name
              <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} aria-invalid={Boolean(errors.name)} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
              {errors.name && <span className="block text-xs text-red-600">{errors.name}</span>}
            </label>
            <label>Fixture
              <input value={draft.fixture} onChange={(event) => updateDraft('fixture', event.target.value)} aria-invalid={Boolean(errors.fixture)} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
              {errors.fixture && <span className="block text-xs text-red-600">{errors.fixture}</span>}
            </label>
            <label>Seeds
              <input type="number" min={1} max={100_000} value={draft.seedCount} onChange={(event) => updateDraft('seedCount', Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
            </label>
            <label>Duration (minutes)
              <input type="number" min={1} max={14_400} value={draft.durationMinutes} onChange={(event) => updateDraft('durationMinutes', Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
            </label>
            <label>Parallelism
              <input type="number" min={1} max={64} value={draft.parallelism} onChange={(event) => updateDraft('parallelism', Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
            </label>
            <label>Tags (comma-separated)
              <input value={draft.tags.join(',')} onChange={(event) => updateDraft('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
              {errors.tags && <span className="block text-xs text-red-600">{errors.tags}</span>}
            </label>
            <p className="md:col-span-2 text-xs" role="status">
              {isDraftValid(draft) ? 'Draft is valid and ready to save.' : 'Complete the highlighted fields to continue.'}
            </p>
          </div>
        )}

        {tab === 'templates' && (
          <ul className="space-y-3 text-sm">
            {BUILTIN_TEMPLATES.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-3 rounded border border-zinc-200 p-3 dark:border-zinc-700">
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-xs text-zinc-500">v{template.version} · {template.draft.seedCount} seeds</p>
                </div>
                <button type="button" onClick={() => setDraft(applyTemplate(template))} className="btn-outline text-xs ml-auto">Use template</button>
                <button type="button" onClick={() => setDraft(applyTemplate(duplicateTemplate(template, BUILTIN_TEMPLATES)))} className="btn-outline text-xs">Duplicate</button>
              </li>
            ))}
          </ul>
        )}

        {tab === 'schedule' && (
          <div className="space-y-3 text-sm">
            <label className="block">
              Kind
              <select value={schedule.kind} onChange={(event) => setSchedule({ ...schedule, kind: event.target.value as ScheduleConfig['kind'] })} className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
                <option value="interval">Interval</option>
                <option value="cron">Cron</option>
                <option value="once">Once</option>
              </select>
            </label>
            <label className="block">Expression
              <input value={schedule.expression} onChange={(event) => setSchedule({ ...schedule, expression: event.target.value })} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
            </label>
            <label className="block">Timezone
              <input value={schedule.timezone} onChange={(event) => setSchedule({ ...schedule, timezone: event.target.value })} className="mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
            </label>
            <p className="text-xs" role="status">{scheduleError ?? describeSchedule(schedule)}</p>
            <p className="text-xs text-zinc-500">Next run: {nextRun ?? 'no eligible slot'}</p>
          </div>
        )}

        {tab === 'budget' && (
          <div className="space-y-3 text-sm">
            {(['maxRuns', 'maxStroops', 'maxMinutes'] as const).map((key) => (
              <label key={key} className="block">
                {key}
                <input
                  type="number"
                  min={0}
                  value={budget[key] ?? ''}
                  onChange={(event) => setBudget({ ...budget, [key]: event.target.value === '' ? null : Number(event.target.value) })}
                  className="ml-2 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                />
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={budget.autoStop} onChange={(event) => setBudget({ ...budget, autoStop: event.target.checked })} />
              Auto-stop when a cap is reached
            </label>
            <p className="text-xs text-zinc-500" role="status">{budgetError ?? `Preview: ${formatStroops(budget.maxStroops ?? 0)} stroop cap`}</p>
          </div>
        )}

        {tab === 'lifecycle' && (
          <div className="space-y-3 text-sm">
            <p>State: <strong>{snapshot.state}</strong> · role: {role}</p>
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  disabled={!canManage(role, state)}
                  onClick={() => applyState(state, new Date().toISOString(), `action-${crypto.randomUUID()}`)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs capitalize disabled:opacity-40 dark:border-zinc-700"
                >
                  {state}
                </button>
              ))}
            </div>
            <p className="text-xs" role="status" aria-live="polite">
              Next action: {evaluateBudget(budget, { runs: 0, stroops: 0, elapsedMinutes: 0 }).action}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
