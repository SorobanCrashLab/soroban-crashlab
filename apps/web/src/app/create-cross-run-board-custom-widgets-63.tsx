"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FuzzingRun } from "./types";

/* ── Types ─────────────────────────────────────────────────────────── */

export type WidgetMetric =
  | "total-runs"
  | "completed"
  | "failed"
  | "running"
  | "avg-duration"
  | "avg-seeds";

export type WidgetColor = "blue" | "purple" | "green" | "amber";

export interface CustomWidget {
  id: string;
  metric: WidgetMetric;
  label: string;
  color: WidgetColor;
}

const STORAGE_KEY = "crashlab-custom-widgets";

const METRIC_OPTIONS: { value: WidgetMetric; label: string }[] = [
  { value: "total-runs", label: "Total Runs" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "avg-duration", label: "Avg Duration" },
  { value: "avg-seeds", label: "Avg Seeds" },
];

const COLOR_OPTIONS: WidgetColor[] = ["blue", "purple", "green", "amber"];

const COLOR_CLASSES: Record<WidgetColor, string> = {
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function computeMetric(metric: WidgetMetric, runs: FuzzingRun[]): string {
  const n = runs.length;
  switch (metric) {
    case "total-runs":
      return String(n);
    case "completed":
      return String(runs.filter((r) => r.status === "completed").length);
    case "failed":
      return String(runs.filter((r) => r.status === "failed").length);
    case "running":
      return String(runs.filter((r) => r.status === "running").length);
    case "avg-duration":
      return n ? `${Math.round(runs.reduce((s, r) => s + r.duration, 0) / n / 60000)}m` : "—";
    case "avg-seeds":
      return n ? String(Math.round(runs.reduce((s, r) => s + r.seedCount, 0) / n)) : "—";
  }
}

function loadWidgets(): CustomWidget[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomWidget[]) : [];
  } catch {
    return [];
  }
}

function saveWidgets(widgets: CustomWidget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

/* ── Component ──────────────────────────────────────────────────────── */

interface Props {
  runs?: FuzzingRun[];
}

export default function CrossRunBoardCustomWidgets({ runs = [] }: Props) {
  const [widgets, setWidgets] = useState<CustomWidget[]>(() => loadWidgets());
  const [adding, setAdding] = useState(false);
  const [newMetric, setNewMetric] = useState<WidgetMetric>("total-runs");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<WidgetColor>("blue");
  const dragIdx = useRef<number | null>(null);



  // Persist whenever widgets change (skip initial empty render)
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) saveWidgets(widgets);
    else mounted.current = true;
  }, [widgets]);

  const addWidget = useCallback(() => {
    const widget: CustomWidget = {
      id: `cw-${Date.now()}`,
      metric: newMetric,
      label: newLabel || METRIC_OPTIONS.find((m) => m.value === newMetric)!.label,
      color: newColor,
    };
    setWidgets((prev) => [...prev, widget]);
    setAdding(false);
    setNewLabel("");
  }, [newMetric, newLabel, newColor]);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  /* ── Drag-and-drop reorder ──────────────────────────────────────── */

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDrop = (targetIdx: number) => {
    const from = dragIdx.current;
    if (from === null || from === targetIdx) return;
    setWidgets((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    dragIdx.current = null;
  };

  return (
    <section aria-label="Custom cross-run widgets" className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Custom Widgets</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          aria-label={adding ? "Cancel adding widget" : "Add widget"}
        >
          {adding ? "Cancel" : "+ Add Widget"}
        </button>
      </div>

      {/* ── Add form ──────────────────────────────────────────────── */}
      {adding && (
        <div className="flex flex-wrap gap-3 items-end mb-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <label className="flex flex-col text-sm">
            Metric
            <select
              value={newMetric}
              onChange={(e) => setNewMetric(e.target.value as WidgetMetric)}
              className="mt-1 rounded border px-2 py-1 bg-white dark:bg-gray-700"
            >
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Label (optional)
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Custom label"
              className="mt-1 rounded border px-2 py-1 bg-white dark:bg-gray-700"
            />
          </label>
          <label className="flex flex-col text-sm">
            Color
            <select
              value={newColor}
              onChange={(e) => setNewColor(e.target.value as WidgetColor)}
              className="mt-1 rounded border px-2 py-1 bg-white dark:bg-gray-700"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            onClick={addWidget}
            className="px-4 py-1 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      )}

      {/* ── Widget grid (draggable) ───────────────────────────────── */}
      {widgets.length === 0 ? (
        <p className="text-sm text-gray-500">No custom widgets yet. Click &quot;+ Add Widget&quot; to create one.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list">
          {widgets.map((w, idx) => (
            <div
              key={w.id}
              role="listitem"
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className={`rounded-xl p-4 border cursor-grab active:cursor-grabbing ${COLOR_CLASSES[w.color]} transition hover:shadow-md relative group`}
            >
              <button
                onClick={() => removeWidget(w.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs rounded-full w-5 h-5 flex items-center justify-center bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20"
                aria-label={`Remove ${w.label} widget`}
              >
                ×
              </button>
              <p className="text-sm font-medium opacity-80 mb-1">{w.label}</p>
              <p className="text-2xl font-bold">{computeMetric(w.metric, runs)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
