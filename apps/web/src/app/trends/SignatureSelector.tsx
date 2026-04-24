'use client';

import { SignatureFrequency } from '../types';

export interface SignatureSelectorProps {
  /** Selected signatures to display */
  selectedSignatures: string[];
  /** Available signatures with metadata */
  availableSignatures: SignatureFrequency[];
  /** Callback when selection changes */
  onChange: (signatures: string[]) => void;
}

/**
 * User-configurable selector for which crash signatures to display.
 * Shows signature count and allows filtering visual clutter.
 */
export function SignatureSelector({
  selectedSignatures,
  availableSignatures,
  onChange,
}: SignatureSelectorProps) {
  if (availableSignatures.length === 0) {
    return null;
  }

  const toggleSignature = (signature: string) => {
    const next = selectedSignatures.includes(signature)
      ? selectedSignatures.filter((s) => s !== signature)
      : [...selectedSignatures, signature];
    onChange(next);
  };

  const selectAll = () => {
    onChange(availableSignatures.map((s) => s.signature));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <fieldset className="border border-zinc-200 dark:border-zinc-800 rounded px-4 py-3 bg-white dark:bg-zinc-950">
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 px-2">
        Signatures ({selectedSignatures.length} of {availableSignatures.length})
      </legend>

      <div className="flex gap-2 mt-2 mb-3">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={clearAll}
          className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2">
        {availableSignatures.map((sig) => (
          <label
            key={sig.signature}
            className="flex items-start gap-2 cursor-pointer select-none p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedSignatures.includes(sig.signature)}
              onChange={() => toggleSignature(sig.signature)}
              className="w-4 h-4 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
                {sig.signature}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {sig.totalCount} crash
                {sig.totalCount === 1 ? '' : 'es'} • {sig.area} • {sig.severity}
              </div>
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
