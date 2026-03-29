'use client';

import { RunSeverity } from '../types';

export interface SeverityFilterProps {
  /** Selected severities */
  selectedSeverities: RunSeverity[];
  /** Callback when selection changes */
  onChange: (severities: RunSeverity[]) => void;
}

/** Display order and labels for severity levels */
const SEVERITY_OPTIONS: ReadonlyArray<{ value: RunSeverity; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

/**
 * Multi-select filter for crash severity.
 * Allows users to filter trends by severity level.
 */
export function SeverityFilter({
  selectedSeverities,
  onChange,
}: SeverityFilterProps) {
  const toggleSeverity = (severity: RunSeverity) => {
    const next = selectedSeverities.includes(severity)
      ? selectedSeverities.filter((s) => s !== severity)
      : [...selectedSeverities, severity];
    onChange(next);
  };

  return (
    <fieldset className="border border-zinc-200 dark:border-zinc-800 rounded px-4 py-3 bg-white dark:bg-zinc-950">
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 px-2">
        Severity
      </legend>

      <div className="flex flex-wrap gap-3 mt-2">
        {SEVERITY_OPTIONS.map(({ value, label }) => (
          <label
            key={value}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selectedSeverities.includes(value)}
              onChange={() => toggleSeverity(value)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
