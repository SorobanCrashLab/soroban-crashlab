"use client";

import {
  AnomalySensitivity,
  SENSITIVITY_K,
  SENSITIVITY_PRESETS,
} from "../utils/trendAnomaly";

export interface AnomalySensitivityToggleProps {
  /** Currently active preset. */
  value: AnomalySensitivity;
  /** Called with the newly selected preset. */
  onChange: (next: AnomalySensitivity) => void;
  /** Number of anomalies currently flagged, for the inline summary. */
  flagCount: number;
}

/** Short rationale shown under the switcher for the active preset. */
const PRESET_HINTS: Record<AnomalySensitivity, string> = {
  low: "Only egregious outliers. Quietest setting, fewest false alarms.",
  medium: "Balanced default (the classic modified z-score cutoff).",
  high: "Catches smaller excursions. Expect more noise.",
};

const PRESET_LABELS: Record<AnomalySensitivity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Per-view sensitivity switcher for anomaly detection.
 *
 * Sensitivity maps to k, the number of robust deviations a day must clear
 * before it is flagged — a higher sensitivity means a lower k.
 */
export function AnomalySensitivityToggle({
  value,
  onChange,
  flagCount,
}: AnomalySensitivityToggleProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          id="anomaly-sensitivity-label"
          className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
        >
          Anomaly sensitivity
        </span>
        <div
          role="radiogroup"
          aria-labelledby="anomaly-sensitivity-label"
          className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {SENSITIVITY_PRESETS.map((preset) => {
            const active = preset === value;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(preset)}
                title={`${PRESET_LABELS[preset]} — k = ${SENSITIVITY_K[preset]}. ${PRESET_HINTS[preset]}`}
                className={[
                  "rounded px-3 py-1 text-xs font-medium transition",
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {PRESET_LABELS[preset]}
                <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  k={SENSITIVITY_K[preset]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {flagCount === 0
          ? "No days exceed the current threshold."
          : `${flagCount} day${flagCount === 1 ? "" : "s"} flagged. `}
        {PRESET_HINTS[value]}
      </p>
    </div>
  );
}
