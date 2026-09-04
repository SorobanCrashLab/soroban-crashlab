"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  humanizeCron,
  nextRunForSchedule,
  validateCron,
  validateScheduleName,
  type Schedule,
  type ScheduledRun,
} from "@/lib/cron";

interface SchedulerPayload {
  schedules: Schedule[];
  history: ScheduledRun[];
}

const TICK_INTERVAL_MS = 10_000;

function fmtUtc(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function unwrap<T>(json: unknown): T {
  const body = json as { data?: T };
  return (body && "data" in body ? body.data : json) as T;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [history, setHistory] = useState<ScheduledRun[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [autoTick, setAutoTick] = useState(true);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const applyPayload = useCallback((payload: SchedulerPayload) => {
    setSchedules(payload.schedules ?? []);
    setHistory(payload.history ?? []);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyPayload(unwrap<SchedulerPayload>(await res.json()));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      try {
        const res = await fetch("/api/schedules", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = unwrap<SchedulerPayload>(await res.json());
        if (cancelled) return;
        setSchedules(payload.schedules ?? []);
        setHistory(payload.history ?? []);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const runTick = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules/tick", { method: "POST" });
      if (!res.ok) return;
      const data = unwrap<SchedulerPayload & { created: ScheduledRun[]; evaluatedAt: string }>(
        await res.json(),
      );
      applyPayload(data);
      setLastTickAt(data.evaluatedAt);
      if (data.created.length > 0) {
        setBanner(
          `Worker recorded ${data.created.length} scheduled run${data.created.length === 1 ? "" : "s"}.`,
        );
      }
    } catch {
      /* transient — the next tick retries */
    }
  }, [applyPayload]);

  // Mock-mode interval worker: drives the whole loop so it is observable.
  // `runTick` is stable (its only dependency, `applyPayload`, is memoised),
  // so the interval is not torn down on every render.
  useEffect(() => {
    if (!autoTick) return;
    const id = setInterval(() => void runTick(), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoTick, runTick]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(id);
  }, [banner]);

  const mountedAt = useMemo(() => new Date(), []);
  // Anchor "next run" math to the worker's last evaluation so the column
  // advances as the loop runs; fall back to mount time before the first tick.
  const now = useMemo(
    () => (lastTickAt ? new Date(lastTickAt) : mountedAt),
    [lastTickAt, mountedAt],
  );

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (schedule: Schedule) => {
    setEditing(schedule);
    setEditorOpen(true);
  };

  const saveSchedule = useCallback(
    async (input: { name: string; cron: string }) => {
      const url = editing ? `/api/schedules/${editing.id}` : "/api/schedules";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (HTTP ${res.status})`);
      }
      setEditorOpen(false);
      setEditing(null);
      await load();
    },
    [editing, load],
  );

  const toggleSchedule = useCallback(
    async (schedule: Schedule) => {
      await fetch(`/api/schedules/${schedule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      await load();
    },
    [load],
  );

  const removeSchedule = useCallback(
    async (schedule: Schedule) => {
      if (!window.confirm(`Delete schedule "${schedule.name}"? Its run history is removed too.`)) {
        return;
      }
      await fetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
      await load();
    },
    [load],
  );

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)),
    [history],
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">
              Scheduled campaigns
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Cron-driven recurring campaigns. Expressions and run times are UTC
              (v1 has no DST / wall-clock semantics).
            </p>
          </div>
          <button
            onClick={openCreate}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            New schedule
          </button>
        </div>

        {banner && (
          <div className="mb-4 rounded-lg border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/20 px-4 py-2 text-sm text-green-800 dark:text-green-300">
            {banner}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={() => void runTick()}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Run tick now
          </button>
          <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={autoTick}
              onChange={(e) => setAutoTick(e.target.checked)}
            />
            Auto-tick worker (every {TICK_INTERVAL_MS / 1000}s)
          </label>
          <span className="text-zinc-500 dark:text-zinc-500">
            Last tick: {lastTickAt ? fmtUtc(lastTickAt) : "—"}
          </span>
        </div>

        {state === "loading" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading schedules…</p>
        )}
        {state === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load schedules.{" "}
            <button className="underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}

        {state === "ready" && (
          <>
            <section className="mb-10">
              <div className="overflow-x-auto bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Schedule</th>
                      <th className="px-4 py-3">Next run (UTC)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                        >
                          No schedules yet. Create one to start continuous assurance.
                        </td>
                      </tr>
                    )}
                    {schedules.map((schedule) => {
                      const nextRun = schedule.enabled
                        ? nextRunForSchedule(schedule, now)
                        : null;
                      return (
                        <tr
                          key={schedule.id}
                          className="border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                        >
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                            {schedule.name}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-zinc-700 dark:text-zinc-300">
                              {humanizeCron(schedule.cron)}
                            </div>
                            <code className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                              {schedule.cron}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {schedule.enabled
                              ? nextRun
                                ? fmtUtc(nextRun.toISOString())
                                : "never"
                              : "paused"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                schedule.enabled
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                              }`}
                            >
                              {schedule.enabled ? "Enabled" : "Paused"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => void toggleSchedule(schedule)}
                                className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                {schedule.enabled ? "Pause" : "Enable"}
                              </button>
                              <button
                                onClick={() => openEdit(schedule)}
                                className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void removeSchedule(schedule)}
                                className="px-2 py-1 rounded border border-red-300 dark:border-red-700 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-zinc-900 dark:text-zinc-100">
                Scheduled run history{" "}
                <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                  ({sortedHistory.length})
                </span>
              </h2>
              <div className="overflow-x-auto bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                      <th className="px-4 py-3">Run</th>
                      <th className="px-4 py-3">Schedule</th>
                      <th className="px-4 py-3">Scheduled for (UTC)</th>
                      <th className="px-4 py-3">Executed (UTC)</th>
                      <th className="px-4 py-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                        >
                          No scheduled runs yet. The worker records one here each time a
                          schedule comes due.
                        </td>
                      </tr>
                    )}
                    {sortedHistory.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {run.id}
                        </td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                          {run.scheduleName}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {fmtUtc(run.scheduledFor)}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {fmtUtc(run.executedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            scheduled
                          </span>
                          {run.caughtUp && (
                            <span
                              className="ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              title={`Collapsed ${run.tickCount} missed ticks into one catch-up run`}
                            >
                              catch-up ×{run.tickCount}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {editorOpen && (
        <ScheduleEditor
          key={editing?.id ?? "new"}
          initial={editing}
          existing={schedules}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSave={saveSchedule}
        />
      )}
    </div>
  );
}

interface ScheduleEditorProps {
  initial: Schedule | null;
  existing: Schedule[];
  onCancel: () => void;
  onSave: (input: { name: string; cron: string }) => Promise<void>;
}

function ScheduleEditor({ initial, existing, onCancel, onSave }: ScheduleEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cron, setCron] = useState(initial?.cron ?? "*/30 * * * *");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameError = validateScheduleName(name, existing, initial?.id);
  const cronError = validateCron(cron);
  const preview = humanizeCron(cron);
  const canSave = !nameError && !cronError && !saving;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSave({ name: name.trim(), cron: cron.trim() });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save schedule.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit schedule" : "New schedule"}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          {initial ? "Edit schedule" : "New schedule"}
        </h2>

        <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent text-sm"
          placeholder="Nightly auth invariant sweep"
          autoFocus
        />
        {name.length > 0 && nameError && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400">{nameError}</p>
        )}
        {(!name.length || !nameError) && <div className="mb-3" />}

        <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Cron expression{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (minute hour day-of-month month day-of-week, UTC)
          </span>
        </label>
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          className="w-full mb-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent text-sm font-mono"
          placeholder="*/30 * * * *"
        />
        {cronError ? (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400">{cronError}</p>
        ) : (
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Preview: <span className="text-zinc-700 dark:text-zinc-300">{preview}</span>
          </p>
        )}

        {submitError && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400">{submitError}</p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg text-sm border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSave}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
