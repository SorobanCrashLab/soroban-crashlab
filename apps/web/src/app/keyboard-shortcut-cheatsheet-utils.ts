/**
 * Keyboard shortcut cheatsheet utilities.
 *
 * Issue: #856 - Add keyboard shortcut cheatsheet modal
 */

import { isEditableTarget } from "../lib/is-editable-target";
import type { CommandEntry } from "../lib/command-palette/registry";

export type ShortcutCategory = "general" | "navigation" | "dashboard";

export interface KeyboardShortcut {
  id: string;
  category: ShortcutCategory;
  keys: string[];
  description: string;
  /** Route path for navigation shortcuts (e.g. G then H). */
  route?: string;
}

export const KEYBOARD_SHORTCUT_CHEATSHEET: KeyboardShortcut[] = [
  {
    id: "toggle-cheatsheet",
    category: "general",
    keys: ["?"],
    description: "Open or close this keyboard shortcuts cheatsheet",
  },
  {
    id: "close-modal",
    category: "general",
    keys: ["Esc"],
    description: "Close the active modal, drawer, or panel",
  },
  {
    id: "go-home",
    category: "navigation",
    keys: ["G", "H"],
    description: "Go to Dashboard",
    route: "/",
  },
  {
    id: "go-runs",
    category: "navigation",
    keys: ["G", "R"],
    description: "Go to Runs",
    route: "/runs",
  },
  {
    id: "go-analytics",
    category: "navigation",
    keys: ["G", "A"],
    description: "Go to Analytics",
    route: "/analytics",
  },
  {
    id: "go-triage",
    category: "navigation",
    keys: ["G", "T"],
    description: "Go to Triage",
    route: "/triage",
  },
  {
    id: "go-settings",
    category: "navigation",
    keys: ["G", "S"],
    description: "Go to Settings",
    route: "/settings",
  },
  {
    id: "navigate-rows",
    category: "dashboard",
    keys: ["↑", "↓"],
    description: "Move between rows in data tables (Home/End jump to first/last row)",
  },
  {
    id: "open-run",
    category: "dashboard",
    keys: ["Enter"],
    description: "Open details for the selected run",
  },
  {
    id: "focus-search",
    category: "dashboard",
    keys: ["/"],
    description: "Focus the global search field",
  },
];

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  navigation: "Navigation",
  dashboard: "Dashboard",
};

export const SHORTCUT_CATEGORY_ORDER: ShortcutCategory[] = [
  "general",
  "navigation",
  "dashboard",
];

export function isTypingContext(activeElement: Element | null): boolean {
  return isEditableTarget(activeElement);
}

export function shouldToggleCheatsheet(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
  isTyping: boolean,
): boolean {
  // Ctrl+/ (or Cmd+/ on macOS) is a dedicated shortcuts-help chord used by
  // several editors and dashboards (VS Code, Linear, Notion) and is safe to
  // honor even while typing, since it doesn't insert a literal character.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === "/") {
    return true;
  }

  if (isTyping || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  return event.key === "?" || (event.key === "/" && event.shiftKey);
}

export function groupShortcutsByCategory(
  shortcuts: KeyboardShortcut[],
): Record<ShortcutCategory, KeyboardShortcut[]> {
  const grouped: Record<ShortcutCategory, KeyboardShortcut[]> = {
    general: [],
    navigation: [],
    dashboard: [],
  };

  for (const shortcut of shortcuts) {
    grouped[shortcut.category].push(shortcut);
  }

  return grouped;
}

export function formatShortcutKeys(keys: string[]): string {
  return keys.join(" then ");
}

export type GoKeyPendingState = "g" | null;

export function resolveGoNavigationShortcut(
  key: string,
  pendingGoKey: GoKeyPendingState,
): { nextPendingGoKey: GoKeyPendingState; route: string | null } {
  const normalized = key.length === 1 ? key.toLowerCase() : key;

  if (pendingGoKey === "g") {
    const shortcut = KEYBOARD_SHORTCUT_CHEATSHEET.find(
      (entry) =>
        entry.route &&
        entry.keys.length === 2 &&
        entry.keys[0] === "G" &&
        entry.keys[1].toLowerCase() === normalized,
    );

    return {
      nextPendingGoKey: null,
      route: shortcut?.route ?? null,
    };
  }

  if (normalized === "g") {
    return { nextPendingGoKey: "g", route: null };
  }

  return { nextPendingGoKey: null, route: null };
}

export function shouldHandleGlobalShortcut(isTyping: boolean, isCheatsheetOpen: boolean): boolean {
  return !isTyping || isCheatsheetOpen;
}

// ─── Registry-driven command entries (single source of truth) ────────────────
//
// The cheatsheet overlay renders every command the palette registry actually
// holds instead of a hand-maintained copy. These helpers keep that mapping
// pure and testable: the registry snapshot → items, the search filter, and the
// category grouping. The keyboard-shortcut model above only supplies the key
// chords (matched per route), never the command list itself.

export type CheatsheetCommandCategory = CommandEntry["category"];

export interface CheatsheetCommandItem {
  /** Registry entry id, so the overlay can execute the original command. */
  commandId: string;
  title: string;
  subtitle?: string;
  category: CheatsheetCommandCategory;
  /** Key chord (e.g. ["G", "H"]) when the route has a registered shortcut. */
  keys?: string[];
  route?: string;
  /** Search keywords carried over from the registry entry. */
  keywords?: string[];
}

/** Maps a route to its shortcut keys, from the keyboard-shortcut model. */
export function navigationKeysByRoute(
  shortcuts: KeyboardShortcut[] = KEYBOARD_SHORTCUT_CHEATSHEET,
): Map<string, string[]> {
  const byRoute = new Map<string, string[]>();
  for (const shortcut of shortcuts) {
    if (shortcut.route) byRoute.set(shortcut.route, shortcut.keys);
  }
  return byRoute;
}

/**
 * Snapshots registry entries into cheatsheet items. Every registered command
 * appears — nothing is filtered out here — with its key chord attached when a
 * navigation shortcut exists for its route.
 */
export function buildCheatsheetCommandItems(
  entries: readonly CommandEntry[],
  keysByRoute: Map<string, string[]> = navigationKeysByRoute(),
): CheatsheetCommandItem[] {
  return entries.map((entry) => ({
    commandId: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    category: entry.category,
    route: entry.route,
    keywords: entry.keywords,
    keys: entry.route ? keysByRoute.get(entry.route) : undefined,
  }));
}

export function cheatsheetCommandHaystack(item: CheatsheetCommandItem): string {
  return [item.title, item.subtitle, item.route, ...(item.keywords ?? []), ...(item.keys ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterCheatsheetCommandItems(
  items: readonly CheatsheetCommandItem[],
  query: string,
): CheatsheetCommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => cheatsheetCommandHaystack(item).includes(needle));
}

export function shortcutSearchText(shortcut: KeyboardShortcut): string {
  return [shortcut.description, ...shortcut.keys].filter(Boolean).join(" ").toLowerCase();
}

export function filterKeyboardShortcuts(
  shortcuts: readonly KeyboardShortcut[],
  query: string,
): KeyboardShortcut[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...shortcuts];
  return shortcuts.filter((shortcut) => shortcutSearchText(shortcut).includes(needle));
}

export const CHEATSHEET_COMMAND_CATEGORY_ORDER: CheatsheetCommandCategory[] = [
  "navigation",
  "action",
  "run",
];

export const CHEATSHEET_COMMAND_CATEGORY_LABELS: Record<CheatsheetCommandCategory, string> = {
  navigation: "Navigation",
  action: "Actions",
  run: "Runs",
};

export function groupCheatsheetCommandItems(
  items: readonly CheatsheetCommandItem[],
): Record<CheatsheetCommandCategory, CheatsheetCommandItem[]> {
  const grouped: Record<CheatsheetCommandCategory, CheatsheetCommandItem[]> = {
    navigation: [],
    action: [],
    run: [],
  };
  for (const item of items) {
    grouped[item.category].push(item);
  }
  return grouped;
}
