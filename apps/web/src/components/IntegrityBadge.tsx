'use client';

import React from 'react';

/**
 * Severity levels for data integrity states (#1885).
 *
 * - corrupt:  Checksum verification failed or artifact is known-bad. Blocks replay.
 * - degraded: Health snapshot is truncated or storage is falling back. Warns user.
 * - unknown:  Verification not yet run or result unavailable. Neutral indicator.
 * - verified: Checksum passed. Informational only.
 */
export type IntegritySeverity = 'corrupt' | 'degraded' | 'unknown' | 'verified';

export interface IntegrityBadgeProps {
  severity: IntegritySeverity;
  /** Short label override; defaults to the canonical label for each severity. */
  label?: string;
  /** Optional tooltip / title attribute for sighted users. */
  title?: string;
  className?: string;
}

const SEVERITY_CONFIG: Record<
  IntegritySeverity,
  { label: string; icon: string; classes: string; role: 'img' | undefined }
> = {
  corrupt: {
    label: 'Corrupt',
    icon: '✕',
    classes:
      'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
    role: 'img',
  },
  degraded: {
    label: 'Degraded',
    icon: '⚠',
    classes:
      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    role: 'img',
  },
  unknown: {
    label: 'Unknown',
    icon: '?',
    classes:
      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700',
    role: undefined,
  },
  verified: {
    label: 'Verified',
    icon: '✓',
    classes:
      'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800',
    role: undefined,
  },
};

/**
 * Inline badge indicating the integrity state of a run, artifact, or snapshot.
 *
 * Severity mapping (documented so badges mean one thing — #1885):
 * - corrupt  → blocking amber/red; disables destructive actions like replay
 * - degraded → amber warning; operation may proceed with caution
 * - unknown  → neutral; no verdict yet
 * - verified → green informational; sampled-verify passed
 */
export function IntegrityBadge({ severity, label, title, className = '' }: IntegrityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  const displayLabel = label ?? config.label;
  const ariaLabel = `Integrity: ${displayLabel}`;

  return (
    <span
      role={config.role}
      aria-label={config.role ? ariaLabel : undefined}
      title={title ?? ariaLabel}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium select-none ${config.classes} ${className}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {displayLabel}
    </span>
  );
}
