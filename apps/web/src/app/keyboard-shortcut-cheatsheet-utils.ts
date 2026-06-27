/**
 * Keyboard shortcut cheatsheet utilities.
 *
 * Issue: #856 - Add keyboard shortcut cheatsheet modal
 */

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
    description: "Move selection between fuzzing runs in tables",
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

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingContext(activeElement: Element | null): boolean {
  if (!activeElement) {
    return false;
  }

  const tagName = activeElement.tagName;
  if (TYPING_TAGS.has(tagName)) {
    return true;
  }

  return (
    "isContentEditable" in activeElement &&
    Boolean((activeElement as HTMLElement).isContentEditable)
  );
}

export function shouldToggleCheatsheet(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
  isTyping: boolean,
): boolean {
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
