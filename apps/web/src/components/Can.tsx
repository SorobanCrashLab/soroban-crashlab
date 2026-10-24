'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { useEffectiveAccess, explainGate, type CapabilityCode } from '../lib/permissions';

/**
 * Gate information handed to render-prop children. `mode="disabled"` also uses
 * it to wire the built-in explanation into the gated element's native
 * `title`/`aria-describedby` attributes.
 */
export interface CanGate {
  capability: CapabilityCode;
  allowed: boolean;
  disabled: boolean;
  /** Tooltip text explaining why the control is unavailable. */
  title?: string;
  /** id of the visible explanation node, for `aria-describedby`. */
  describedBy?: string;
  /** Full human explanation of the denial. */
  reason: string;
}

export interface CanProps {
  capability: CapabilityCode;
  /**
   * `hidden` (default) — render `fallback` instead of the child when the
   * caller lacks the capability. `disabled` — always render the child, but
   * disabled, with an explanation attached (discoverability over concealment).
   */
  mode?: 'hidden' | 'disabled';
  /** Rendered in `hidden` mode while access is denied (including while loading). */
  fallback?: ReactNode;
  /**
   * Set false when the caller renders its own explanation — a shared card
   * note, a menu row, a table cell — and passes `describedBy` to link the
   * gated element to it.
   */
  showNote?: boolean;
  /** id of an explanation node rendered elsewhere (overrides the built-in note). */
  describedBy?: string;
  children: ReactNode | ((gate: CanGate) => ReactNode);
}

/**
 * Capability-gated subtree (#1880). The role is read once per page load from
 * `GET /api/settings/roles/me` through `useEffectiveAccess` (shared module
 * cache), so `Can` wrappers are cheap. While access is still resolving, every
 * gate denies — nothing interactive appears before the caller's role is known.
 *
 * Always pair the gated control with a visible or linked explanation: an
 * action the caller cannot use must say why, not silently vanish without a
 * trace when it is the only affordance for a feature (the capability matrix
 * on Settings → Roles covers pages whose controls are all gated).
 */
export function Can({
  capability,
  mode = 'hidden',
  fallback = null,
  showNote = true,
  describedBy,
  children,
}: CanProps) {
  const { status, can: holdsCapability, access } = useEffectiveAccess();
  const noteId = useId();

  const allowed = status === 'ready' && holdsCapability(capability);
  const reason = explainGate(capability, status, access?.role ?? null);

  if (allowed) {
    const openGate: CanGate = { capability, allowed: true, disabled: false, reason };
    return <>{typeof children === 'function' ? children(openGate) : children}</>;
  }

  if (mode === 'hidden') return <>{fallback}</>;

  const useInternalNote = showNote && !describedBy;
  const gate: CanGate = {
    capability,
    allowed: false,
    disabled: true,
    title: reason,
    describedBy: describedBy ?? (useInternalNote ? noteId : undefined),
    reason,
  };
  const denied = typeof children === 'function' ? children(gate) : children;

  const note = useInternalNote ? (
    <span id={noteId} data-testid={`gate-note-${capability}`} className="text-xs text-amber-700 dark:text-amber-400">
      {reason}
    </span>
  ) : null;

  if (!isValidElement(denied)) {
    // Non-element children cannot carry disabled/aria wiring; show the note.
    return (
      <span className="contents" data-gate={capability}>
        {note}
        {denied}
      </span>
    );
  }

  const gated = cloneElement(denied as ReactElement<Record<string, unknown>>, {
    disabled: true,
    title: gate.title,
    ...(gate.describedBy ? { 'aria-describedby': gate.describedBy } : {}),
    'data-gate-disabled': capability,
  });

  return (
    <span className="contents" data-gate={capability}>
      {note}
      {gated}
    </span>
  );
}
