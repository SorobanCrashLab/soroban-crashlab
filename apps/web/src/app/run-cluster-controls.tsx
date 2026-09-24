import React, { useCallback, useRef } from "react";
import {
  type ClusterMode,
  type ClusterSortKey,
  type ViewMode,
} from "./run-cluster-visualization-utils";

/**
 * Option descriptor for the cluster grouping buttons.
 */
export interface ClusterModeOption {
  value: ClusterMode;
  label: string;
}

/**
 * Cluster grouping modes in render order.
 */
export const CLUSTER_MODE_OPTIONS: ClusterModeOption[] = [
  { value: "status", label: "Status" },
  { value: "area", label: "Area" },
  { value: "severity", label: "Severity" },
  { value: "performance", label: "Performance" },
  { value: "failure", label: "Failures" },
];

/**
 * Option descriptor for the view mode buttons.
 */
export interface ViewModeOption {
  value: ViewMode;
  label: string;
  icon: string;
}

/**
 * View modes in render order.
 */
export const VIEW_MODE_OPTIONS: ViewModeOption[] = [
  { value: "grid", label: "Grid", icon: "⊞" },
  { value: "bubbles", label: "Bubbles", icon: "●" },
  { value: "timeline", label: "Timeline", icon: "📊" },
  { value: "metrics", label: "Metrics", icon: "📈" },
];

export interface ClusterControlsProps {
  clusterMode: ClusterMode;
  onClusterModeChange: (mode: ClusterMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: ClusterSortKey;
  onSortByChange: (sortBy: ClusterSortKey) => void;
  showTimeline: boolean;
  showMetrics: boolean;
}

/**
 * Focus the `index`-th button inside a button group.
 */
function focusButtonAtIndex(
  group: HTMLDivElement | null,
  index: number,
): void {
  if (!group) return;
  const buttons = Array.from(
    group.querySelectorAll<HTMLButtonElement>("button"),
  );
  buttons[index]?.focus();
}

/**
 * Roving-tabindex arrow key navigation shared by the mode/view button groups.
 * Arrow keys move focus between the buttons, Home/End jump to the edges, and
 * each group keeps a single tab stop on its active button.
 */
function handleButtonGroupKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  group: HTMLDivElement | null,
): void {
  if (!group) return;
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
  if (buttons.length === 0) return;

  const currentIndex = buttons.findIndex(
    (button) => button === document.activeElement,
  );

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      event.preventDefault();
      focusButtonAtIndex(group, (currentIndex + 1) % buttons.length);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      event.preventDefault();
      focusButtonAtIndex(
        group,
        (currentIndex - 1 + buttons.length) % buttons.length,
      );
      break;
    case "Home":
      event.preventDefault();
      focusButtonAtIndex(group, 0);
      break;
    case "End":
      event.preventDefault();
      focusButtonAtIndex(group, buttons.length - 1);
      break;
    default:
      break;
  }
}

/**
 * Button group with a single tab stop (roving focus) and arrow-key
 * navigation between its buttons.
 */
const ButtonGroup: React.FC<{
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ ariaLabel, children }) => {
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) =>
      handleButtonGroupKeyDown(event, groupRef.current),
    [],
  );

  return (
    <div
      ref={groupRef}
      className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1"
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
};

/**
 * Button component for cluster mode selection.
 */
const ClusterModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    tabIndex={active ? 0 : -1}
    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      active
        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:bg-zinc-200 dark:hover:bg-zinc-700"
    }`}
  >
    {children}
  </button>
);

/**
 * View mode button component.
 */
const ViewModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    tabIndex={active ? 0 : -1}
    className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active
        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
    }`}
  >
    <span aria-hidden="true">{icon}</span>
    {children}
  </button>
);

/**
 * Toolbar for the run cluster visualization: cluster grouping mode, view
 * mode, and sort order. Memoized because every prop is a primitive plus a
 * stable state setter, so it only re-renders when a selection actually
 * changes.
 */
export const ClusterControls = React.memo<ClusterControlsProps>(
  function ClusterControls({
    clusterMode,
    onClusterModeChange,
    viewMode,
    onViewModeChange,
    sortBy,
    onSortByChange,
    showTimeline,
    showMetrics,
  }) {
    const visibleViewModes = VIEW_MODE_OPTIONS.filter(
      (option) =>
        option.value === "grid" ||
        option.value === "bubbles" ||
        (option.value === "timeline" && showTimeline) ||
        (option.value === "metrics" && showMetrics),
    );

    return (
      <div className="flex flex-wrap gap-3">
        <ButtonGroup ariaLabel="Cluster grouping mode">
          {CLUSTER_MODE_OPTIONS.map((option) => (
            <ClusterModeButton
              key={option.value}
              active={clusterMode === option.value}
              onClick={() => onClusterModeChange(option.value)}
            >
              {option.label}
            </ClusterModeButton>
          ))}
        </ButtonGroup>

        <ButtonGroup ariaLabel="View mode">
          {visibleViewModes.map((option) => (
            <ViewModeButton
              key={option.value}
              active={viewMode === option.value}
              onClick={() => onViewModeChange(option.value)}
              icon={option.icon}
            >
              {option.label}
            </ViewModeButton>
          ))}
        </ButtonGroup>

        <select
          value={sortBy}
          onChange={(event) =>
            onSortByChange(event.target.value as ClusterSortKey)
          }
          aria-label="Sort clusters by"
          className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
        >
          <option value="count">Sort by Count</option>
          <option value="duration">Sort by Duration</option>
          <option value="failure-rate">Sort by Failure Rate</option>
        </select>
      </div>
    );
  },
);

ClusterControls.displayName = "ClusterControls";
