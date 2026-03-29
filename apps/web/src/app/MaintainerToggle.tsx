'use client';

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
      <button
        type="button"
        role="switch"
        aria-checked={isMaintainer}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
          isMaintainer
            ? 'bg-blue-600'
            : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
        aria-label="Toggle maintainer view"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isMaintainer ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
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
