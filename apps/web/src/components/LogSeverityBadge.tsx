'use client';

import React from 'react';
import { LogLevel } from '../app/log-viewer-utils';

export interface LogSeverityBadgeProps {
  level: LogLevel | 'critical' | 'warning' | 'info' | 'debug' | 'trace';
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export function getSeverityDescription(level: string): string {
  switch (level.toLowerCase()) {
    case 'error':
    case 'critical':
      return 'Critical or error severity — requires immediate attention';
    case 'warn':
    case 'warning':
      return 'Warning severity — review recommended';
    case 'info':
      return 'Informational log entry';
    case 'debug':
    case 'trace':
    default:
      return 'Debug or trace diagnostic entry';
  }
}

export function getSeverityStyleClasses(level: string): { bg: string; text: string; border: string; dot: string } {
  const norm = level.toLowerCase();

  switch (norm) {
    case 'error':
    case 'critical':
      return {
        bg: 'bg-rose-100 dark:bg-rose-950/60',
        text: 'text-rose-800 dark:text-rose-200',
        border: 'border-rose-200 dark:border-rose-800/80',
        dot: 'bg-rose-500',
      };
    case 'warn':
    case 'warning':
      return {
        bg: 'bg-amber-100 dark:bg-amber-950/60',
        text: 'text-amber-900 dark:text-amber-200',
        border: 'border-amber-200 dark:border-amber-800/80',
        dot: 'bg-amber-500',
      };
    case 'info':
      return {
        bg: 'bg-sky-100 dark:bg-sky-950/60',
        text: 'text-sky-800 dark:text-sky-200',
        border: 'border-sky-200 dark:border-sky-800/80',
        dot: 'bg-sky-500',
      };
    case 'debug':
    case 'trace':
    default:
      return {
        bg: 'bg-zinc-100 dark:bg-zinc-800/80',
        text: 'text-zinc-700 dark:text-zinc-300',
        border: 'border-zinc-200 dark:border-zinc-700',
        dot: 'bg-zinc-400',
      };
  }
}

export default function LogSeverityBadge({
  level,
  size = 'sm',
  showDot = true,
}: LogSeverityBadgeProps) {
  const styles = getSeverityStyleClasses(level);
  const description = getSeverityDescription(level);

  const sizeClasses =
    size === 'md'
      ? 'text-[11px] sm:text-xs px-2.5 py-1'
      : 'text-[9px] sm:text-[10px] px-1.5 py-0.5';

  return (
    <span
      role="status"
      data-severity={String(level).toLowerCase()}
      title={description}
      className={`inline-flex items-center gap-1.5 font-mono uppercase font-bold rounded border tracking-wider transition-colors ${sizeClasses} ${styles.bg} ${styles.text} ${styles.border}`}
      aria-label={`Log level ${level}: ${description}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />}
      {level}
    </span>
  );
}
