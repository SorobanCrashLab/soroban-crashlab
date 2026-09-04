'use client';

import { Toggle } from '../components/Toggle';

interface MaintainerToggleProps {
  isMaintainer: boolean;
  onToggle: () => void;
  mounted: boolean;
}

export default function MaintainerToggle({ isMaintainer, onToggle, mounted }: MaintainerToggleProps) {
  if (!mounted) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        View
      </span>
      <Toggle
        checked={isMaintainer}
        onChange={onToggle}
        ariaLabel="Toggle maintainer view"
      />
      <span className="text-sm font-medium">
        {isMaintainer ? (
          <span className="text-blue-700 dark:text-blue-400">Maintainer</span>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">Viewer</span>
        )}
      </span>
    </div>
  );
}
