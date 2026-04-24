"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FuzzingRun } from "./types";
import { 
  WidgetMetric, 
  WidgetColor, 
  CustomWidget, 
  computeMetric, 
  reorderWidgets 
} from "./custom-widgets-utils";

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

interface Props {
  runs?: FuzzingRun[];
}

export default function CrossRunBoardCustomWidgets({ runs = [] }: Props) {
  const [widgets, setWidgets] = useState<CustomWidget[]>([]);
  const [adding, setAdding] = useState(false);
  
  const [newMetric, setNewMetric] = useState<WidgetMetric>("total-runs");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<WidgetColor>("blue");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchWidgets = async () => {
      try {
        await new Promise(res => setTimeout(res, 800));
        if (!isMounted) return;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          setWidgets(JSON.parse(raw) as CustomWidget[]);
        }
        setIsLoading(false);
      } catch {
        if (isMounted) {
          setError("Failed to load custom widgets.");
          setIsLoading(false);
        }
      }
    };
    fetchWidgets();
    return () => { isMounted = false; };
  }, []);

  const handleSave = async (newWidgets: CustomWidget[]) => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await new Promise((res, rej) => setTimeout(() => {
        if (Math.random() < 0.05) rej(new Error("Save failed"));
        else res(null);
      }, 500));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
      setWidgets(newWidgets);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const addWidget = useCallback(() => {
    const widget: CustomWidget = {
      id: `cw-${Date.now()}`,
      metric: newMetric,
      label: newLabel || METRIC_OPTIONS.find((m) => m.value === newMetric)!.label,
      color: newColor,
    };
    handleSave([...widgets, widget]);
    setAdding(false);
    setNewLabel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newMetric, newLabel, newColor, widgets]);

  const removeWidget = useCallback((id: string) => {
    handleSave(widgets.filter((w) => w.id !== id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDrop = (targetIdx: number) => {
    const from = dragIdx.current;
    if (from === null || from === targetIdx) return;
    const next = reorderWidgets(widgets, from, targetIdx);
    handleSave(next);
    dragIdx.current = null;
  };

  const moveWidget = (idx: number, direction: 'left' | 'right') => {
    if (direction === 'left' && idx > 0) {
      handleSave(reorderWidgets(widgets, idx, idx - 1));
    } else if (direction === 'right' && idx < widgets.length - 1) {
      handleSave(reorderWidgets(widgets, idx, idx + 1));
    }
  };

  if (isLoading) {
    return (
      <section aria-label="Loading custom widgets" className="mt-8 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl p-4 border bg-gray-100 dark:bg-gray-800 h-24"></div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Custom cross-run widgets" className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom Widgets</h3>
          {isSaving && (
            <span className="text-sm text-gray-500 flex items-center gap-1" aria-live="polite">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          )}
          {saveSuccess && (
            <span className="text-sm text-green-600 dark:text-green-400" aria-live="polite">Saved</span>
          )}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={isSaving}
          className="text-sm px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-expanded={adding}
          aria-controls="add-widget-form"
        >
          {adding ? "Cancel" : "+ Add Widget"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2" role="alert">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {adding && (
        <div id="add-widget-form" className="flex flex-wrap gap-4 items-end mb-6 p-5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex flex-col text-sm w-48">
            <label htmlFor="widget-metric" className="mb-1 text-gray-700 dark:text-gray-300 font-medium">Metric</label>
            <select
              id="widget-metric"
              value={newMetric}
              onChange={(e) => setNewMetric(e.target.value as WidgetMetric)}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm w-48">
            <label htmlFor="widget-label" className="mb-1 text-gray-700 dark:text-gray-300 font-medium">Label (optional)</label>
            <input
              id="widget-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Custom label"
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col text-sm w-32">
            <label htmlFor="widget-color" className="mb-1 text-gray-700 dark:text-gray-300 font-medium">Color</label>
            <select
              id="widget-color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value as WidgetColor)}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 capitalize focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addWidget}
            disabled={isSaving}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            Save Widget
          </button>
        </div>
      )}

      {widgets.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 p-6 rounded-lg text-center">
          No custom widgets yet. Click &quot;+ Add Widget&quot; to create one.
        </p>
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
              aria-label={`Widget ${w.label}: ${computeMetric(w.metric, runs)}`}
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-white/50 dark:bg-black/50 p-1 rounded-md backdrop-blur-sm shadow-sm transition-opacity">
                <button
                  onClick={() => moveWidget(idx, 'left')}
                  disabled={idx === 0 || isSaving}
                  className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 rounded disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Move ${w.label} left`}
                  title="Move left"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                  onClick={() => moveWidget(idx, 'right')}
                  disabled={idx === widgets.length - 1 || isSaving}
                  className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 rounded disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Move ${w.label} right`}
                  title="Move right"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <button
                  onClick={() => removeWidget(w.id)}
                  disabled={isSaving}
                  className="w-6 h-6 flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Remove ${w.label} widget`}
                  title="Remove widget"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              
              <p className="text-sm font-medium opacity-80 mb-1 pr-24">{w.label}</p>
              <p className="text-3xl font-bold">{computeMetric(w.metric, runs)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
