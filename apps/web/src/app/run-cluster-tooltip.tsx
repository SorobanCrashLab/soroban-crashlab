import React from "react";

export interface ClusterTooltipProps {
  label: string;
  /**
   * Optional secondary line, e.g. a run count.
   */
  detail?: string;
  /**
   * Visible only while the owner is hovered or focused. Hidden (and fully
   * removed from the accessibility tree via `aria-hidden`) otherwise, so
   * static renders remain unchanged.
   */
  visible: boolean;
}

/**
 * Small floating tooltip used by cluster bubbles. Rendered dead-center above
 * the owner; `pointer-events-none` keeps it from intercepting interactions.
 */
export const ClusterTooltip: React.FC<ClusterTooltipProps> = ({
  label,
  detail,
  visible,
}) => (
  <div
    role="tooltip"
    aria-hidden={!visible}
    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg transition-opacity duration-150 z-20 ${
      visible ? "opacity-100" : "opacity-0"
    }`}
  >
    <span className="block">{label}</span>
    {detail ? (
      <span className="block text-[10px] opacity-70">{detail}</span>
    ) : null}
  </div>
);

ClusterTooltip.displayName = "ClusterTooltip";
