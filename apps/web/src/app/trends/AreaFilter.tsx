'use client';

import { RunArea } from '../types';

export interface AreaFilterProps {
  /** Selected areas */
  selectedAreas: RunArea[];
  /** Available areas to filter */
  availableAreas: RunArea[];
  /** Callback when selection changes */
  onChange: (areas: RunArea[]) => void;
}

/**
 * Multi-select filter for crash areas.
 * Allows users to filter trends by product area.
 */
export function AreaFilter({
  selectedAreas,
  availableAreas,
  onChange,
}: AreaFilterProps) {
  if (availableAreas.length === 0) {
    return null;
  }

  const toggleArea = (area: RunArea) => {
    const next = selectedAreas.includes(area)
      ? selectedAreas.filter((a) => a !== area)
      : [...selectedAreas, area];
    onChange(next);
  };

  return (
    <fieldset className="border border-zinc-200 dark:border-zinc-800 rounded px-4 py-3 bg-white dark:bg-zinc-950">
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 px-2">
        Area
      </legend>

      <div className="flex flex-wrap gap-3 mt-2">
        {availableAreas.map((area) => (
          <label
            key={area}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selectedAreas.includes(area)}
              onChange={() => toggleArea(area)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">
              {area}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
