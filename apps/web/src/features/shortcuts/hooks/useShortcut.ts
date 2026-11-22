'use client';

/**
 * hooks/useShortcut — registers or reads a contextual keyboard shortcut binding
 * from the central ShortcutProvider registry, providing discoverability hints
 * (tooltip / command palette badge), reduced-motion safe feedback, and
 * audit-safe privileged action triggering (#2315).
 */

import { useEffect, useMemo } from 'react';
import { useShortcutContext } from '../ShortcutProvider';
import {
  formatShortcutForPlatform,
  normalizeKeyCombo,
  type EffectiveShortcutBinding,
} from '../shortcutRegistry';

export interface UseShortcutOptions {
  /** Optional callback fired when the user triggers this shortcut. */
  onTrigger?: () => void;
  /** Listen to window keydown events when true. Defaults to false for passive hint lookups. */
  listenKeydown?: boolean;
  /** Target platform display format. Defaults to 'standard'. */
  platform?: 'standard' | 'mac';
}

export interface UseShortcutResult {
  command: EffectiveShortcutBinding | undefined;
  effectiveBinding: string;
  displayBadge: string;
  tooltipHint: string;
  nonKeyboardAlternative: string;
  enabled: boolean;
  trigger: () => void;
}

function eventToNormalizedCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && e.key.length > 1 && e.key !== 'Shift') parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const ignoredKeys = new Set(['Control', 'Alt', 'Shift', 'Meta']);
  if (!ignoredKeys.has(e.key)) {
    parts.push(e.key === ' ' ? 'Space' : e.key);
  }
  return normalizeKeyCombo(parts.join('+'));
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.isContentEditable
  );
}

export function useShortcut(
  commandId: string,
  options: UseShortcutOptions = {},
): UseShortcutResult {
  const ctx = useShortcutContext();
  const { onTrigger, listenKeydown = false, platform = 'standard' } = options;

  const command = useMemo(
    () => ctx.bindings.find((b) => b.id === commandId),
    [commandId, ctx.bindings],
  );

  const effectiveBinding = command?.effectiveBinding ?? '';
  const displayBadge = effectiveBinding
    ? formatShortcutForPlatform(effectiveBinding, platform)
    : 'Unbound';
  const nonKeyboardAlternative =
    command?.nonKeyboardAlternative ?? 'Available via toolbar menu';
  const tooltipHint = command
    ? `${command.title} (${displayBadge}) · UI alternative: ${nonKeyboardAlternative}`
    : commandId;

  useEffect(() => {
    if (!listenKeydown || !onTrigger || !command || !command.enabled) return;
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target) && command.scope !== 'modal') return;
      const combo = eventToNormalizedCombo(e);
      if (combo && combo === normalizeKeyCombo(command.effectiveBinding)) {
        e.preventDefault();
        ctx.triggerCommandById(command.id, onTrigger);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [command, ctx, listenKeydown, onTrigger]);

  return {
    command,
    effectiveBinding,
    displayBadge,
    tooltipHint,
    nonKeyboardAlternative,
    enabled: Boolean(command?.enabled),
    trigger: () => ctx.triggerCommandById(commandId, onTrigger),
  };
}

export default useShortcut;
