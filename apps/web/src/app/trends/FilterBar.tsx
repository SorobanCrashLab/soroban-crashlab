'use client';

import { RunArea, RunSeverity, SignatureFrequency } from '../types';
import { AreaFilter } from './AreaFilter';
import { SeverityFilter } from './SeverityFilter';
import { SignatureSelector } from './SignatureSelector';

export interface FilterBarProps {
  /** Selected area filter values */
  selectedAreas: RunArea[];
  /** Selected severity filter values */
  selectedSeverities: RunSeverity[];
  /** Selected signatures to display */
  selectedSignatures: string[];
  /** Available areas derived from data */
  availableAreas: RunArea[];
  /** Available signatures with metadata */
  availableSignatures: SignatureFrequency[];
  /** Callback for area filter changes */
  onAreasChange: (areas: RunArea[]) => void;
  /** Callback for severity filter changes */
  onSeveritiesChange: (severities: RunSeverity[]) => void;
  /** Callback for signature selection changes */
  onSignaturesChange: (signatures: string[]) => void;
}

/**
 * Combined filter bar containing all crash trend filters.
 * Reactive component: filter changes immediately update upstream.
 */
export function FilterBar({
  selectedAreas,
  selectedSeverities,
  selectedSignatures,
  availableAreas,
  availableSignatures,
  onAreasChange,
  onSeveritiesChange,
  onSignaturesChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-4 p-6 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Filters
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <AreaFilter
            selectedAreas={selectedAreas}
            availableAreas={availableAreas}
            onChange={onAreasChange}
          />
          <SeverityFilter
            selectedSeverities={selectedSeverities}
            onChange={onSeveritiesChange}
          />
          {availableSignatures.length > 0 && (
            <SignatureSelector
              selectedSignatures={selectedSignatures}
              availableSignatures={availableSignatures}
              onChange={onSignaturesChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
