import type { CiStatus } from "./lib/model";
import { STATUS_LABEL } from "./lib/status";

const BADGE_CLASSES: Record<CiStatus, string> = {
  pass: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
  fail: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300",
  warn: "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300",
  skip: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800/60 dark:text-zinc-300",
  pending: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300",
};

const SIGN: Record<CiStatus, string> = {
  pass: "✓",
  fail: "✕",
  warn: "!",
  skip: "–",
  pending: "◌",
};

export interface StatusBadgeProps {
  status: CiStatus;
  label?: string;
}

/** Status is always icon + text; colour is only a secondary cue. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_CLASSES[status]}`}
    >
      <span aria-hidden="true">{SIGN[status]}</span>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
