'use client';

/**
 * WAI-ARIA tabs (automatic activation) shared by the wave-4 explorers
 * (#2339–#2342): roving tabindex, Arrow/Home/End navigation, and panels
 * labelled by their tab. Controlled, so callers can persist the selection.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

export interface AccessibleTabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  label: string;
  children: ReactNode;
  className?: string;
}

export function AccessibleTabs<T extends string>({
  tabs,
  selected,
  onSelect,
  label,
  children,
  className,
}: AccessibleTabsProps<T>) {
  const baseId = useId();
  const refs = useRef(new Map<T, HTMLButtonElement | null>());

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next].id;
    onSelect(target);
    refs.current.get(target)?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-token">
        {tabs.map((tab) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current.set(tab.id, node);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${active ? 'border-blue-500 font-semibold' : 'border-transparent text-muted'}`}
              onClick={() => onSelect(tab.id)}
              onKeyDown={onKeyDown}
            >
              {tab.label}
              {tab.badge !== undefined ? <span className="ml-1 ds-badge ds-badge-neutral">{tab.badge}</span> : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${selected}`} tabIndex={0} className="pt-3">
        {children}
      </div>
    </div>
  );
}
