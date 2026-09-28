import * as assert from "node:assert/strict";
import {
  buildCheatsheetCommandItems,
  CHEATSHEET_COMMAND_CATEGORY_ORDER,
  filterCheatsheetCommandItems,
  filterKeyboardShortcuts,
  formatShortcutKeys,
  groupShortcutsByCategory,
  isTypingContext,
  KEYBOARD_SHORTCUT_CHEATSHEET,
  navigationKeysByRoute,
  resolveGoNavigationShortcut,
  shouldHandleGlobalShortcut,
  shouldToggleCheatsheet,
  SHORTCUT_CATEGORY_ORDER,
} from "./keyboard-shortcut-cheatsheet-utils";
import { buildStaticEntries } from "./command-palette-static-entries";
import { createCommandRegistry } from "../lib/command-palette/registry";

function testCheatsheetCatalog() {
  assert.ok(KEYBOARD_SHORTCUT_CHEATSHEET.length >= 8);
  assert.ok(
    KEYBOARD_SHORTCUT_CHEATSHEET.some((entry) => entry.id === "toggle-cheatsheet"),
  );

  for (const category of SHORTCUT_CATEGORY_ORDER) {
    assert.ok(
      KEYBOARD_SHORTCUT_CHEATSHEET.some((entry) => entry.category === category),
      `Expected shortcuts in category ${category}`,
    );
  }
}

function testGroupShortcutsByCategory() {
  const grouped = groupShortcutsByCategory(KEYBOARD_SHORTCUT_CHEATSHEET);
  const total = SHORTCUT_CATEGORY_ORDER.reduce(
    (sum, category) => sum + grouped[category].length,
    0,
  );

  assert.equal(total, KEYBOARD_SHORTCUT_CHEATSHEET.length);
  assert.ok(grouped.general.length >= 2);
  assert.ok(grouped.navigation.length >= 4);
}

function testFormatShortcutKeys() {
  assert.equal(formatShortcutKeys(["G", "H"]), "G then H");
  assert.equal(formatShortcutKeys(["?"]), "?");
}

function testShouldToggleCheatsheet() {
  assert.equal(shouldToggleCheatsheet({ key: "?", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, false), true);
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false }, false), true);
  assert.equal(shouldToggleCheatsheet({ key: "?", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, true), false);
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, false), false);
  assert.equal(shouldToggleCheatsheet({ key: "?", shiftKey: false, ctrlKey: true, metaKey: false, altKey: false }, false), false);

  // Ctrl+/ and Cmd+/ toggle the cheatsheet, including while typing, since
  // the chord doesn't insert a literal character into the focused field.
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: false, ctrlKey: true, metaKey: false, altKey: false }, false), true);
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: false, ctrlKey: false, metaKey: true, altKey: false }, false), true);
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: false, ctrlKey: true, metaKey: false, altKey: false }, true), true);
  // Alt+Ctrl+/ and Ctrl+Shift+/ are not the dedicated chord and stay blocked.
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: false, ctrlKey: true, metaKey: false, altKey: true }, false), false);
  assert.equal(shouldToggleCheatsheet({ key: "/", shiftKey: true, ctrlKey: true, metaKey: false, altKey: false }, false), false);
}

function testResolveGoNavigationShortcut() {
  assert.deepEqual(resolveGoNavigationShortcut("h", "g"), {
    nextPendingGoKey: null,
    route: "/",
  });
  assert.deepEqual(resolveGoNavigationShortcut("r", "g"), {
    nextPendingGoKey: null,
    route: "/runs",
  });
  assert.deepEqual(resolveGoNavigationShortcut("g", null), {
    nextPendingGoKey: "g",
    route: null,
  });
  assert.deepEqual(resolveGoNavigationShortcut("x", "g"), {
    nextPendingGoKey: null,
    route: null,
  });
}

function testIsTypingContext() {
  const input = { tagName: "INPUT", isContentEditable: false } as HTMLElement;
  const textarea = { tagName: "TEXTAREA", isContentEditable: false } as HTMLElement;
  const button = { tagName: "BUTTON", isContentEditable: false } as HTMLElement;
  const editable = { tagName: "DIV", isContentEditable: true } as HTMLElement;

  assert.equal(isTypingContext(input), true);
  assert.equal(isTypingContext(textarea), true);
  assert.equal(isTypingContext(button), false);
  assert.equal(isTypingContext(editable), true);
  assert.equal(isTypingContext(null), false);
}

function testShouldHandleGlobalShortcut() {
  assert.equal(shouldHandleGlobalShortcut(false, false), true);
  assert.equal(shouldHandleGlobalShortcut(true, false), false);
  assert.equal(shouldHandleGlobalShortcut(true, true), true);
}

// ─── Registry ↔ cheatsheet consistency (#1658) ───────────────────────────────

/** Builds the registry exactly the way CommandPalette wires it up. */
function buildRegisteredStaticEntries() {
  const registry = createCommandRegistry();
  registry.registerEntries(
    buildStaticEntries({
      navigate: () => {},
      toggleTheme: () => {},
      toggleMaintainerMode: () => {},
      exportCurrentView: () => {},
      onRecentsCleared: () => {},
    }),
  );
  return registry;
}

function testNoUnlistedCommands() {
  const registry = buildRegisteredStaticEntries();
  const entries = registry.listEntries();
  const items = buildCheatsheetCommandItems(entries);

  // Every registered command must surface in the cheatsheet — the overlay
  // renders the registry snapshot, so a registered-but-hidden command is a
  // regression in the mapping, not a UI preference.
  const itemIds = new Set(items.map((item) => item.commandId));
  assert.equal(items.length, entries.length, "every registry entry maps to exactly one cheatsheet item");
  for (const entry of entries) {
    assert.ok(itemIds.has(entry.id), `registered command "${entry.id}" must appear in the cheatsheet`);
  }

  // Commands are grouped by their palette category in display order.
  const grouped = new Map(items.map((item) => [item.commandId, item]));
  assert.ok(
    CHEATSHEET_COMMAND_CATEGORY_ORDER.includes('navigation') &&
      CHEATSHEET_COMMAND_CATEGORY_ORDER.includes('action'),
    "cheatsheet groups commands by palette category",
  );
  assert.deepEqual(grouped.get('nav:runs')?.keys, ['G', 'R'], "navigation commands carry their key chord by route");
  assert.equal(grouped.get('nav:runs')?.route, '/runs');
  console.log("✓ testNoUnlistedCommands");
}

function testShortcutRoutesAreRegisteredCommands() {
  const registry = buildRegisteredStaticEntries();
  const registeredRoutes = new Set(
    registry.listEntries().filter((entry) => entry.route).map((entry) => entry.route),
  );

  // The shortcut model must never point at a route the palette registry does
  // not actually expose — otherwise the cheatsheet would advertise a command
  // that cannot be executed.
  for (const shortcut of KEYBOARD_SHORTCUT_CHEATSHEET) {
    if (!shortcut.route) continue;
    assert.ok(
      registeredRoutes.has(shortcut.route),
      `shortcut "${shortcut.id}" routes to ${shortcut.route}, which has no registered palette command`,
    );
  }

  // …and every registry navigation command must have a discoverable chord when
  // a shortcut exists for its route (the matching is by route, not by hand).
  const keysByRoute = navigationKeysByRoute();
  for (const shortcut of KEYBOARD_SHORTCUT_CHEATSHEET) {
    if (!shortcut.route) continue;
    assert.deepEqual(
      keysByRoute.get(shortcut.route),
      shortcut.keys,
      `route ${shortcut.route} should resolve ${shortcut.keys.join(' then ')}`,
    );
  }
  console.log("✓ testShortcutRoutesAreRegisteredCommands");
}

function testCheatsheetSearchFiltering() {
  const registry = buildRegisteredStaticEntries();
  const items = buildCheatsheetCommandItems(registry.listEntries());

  assert.equal(filterCheatsheetCommandItems(items, "  ").length, items.length, "blank query returns everything");
  const runs = filterCheatsheetCommandItems(items, "runs");
  assert.ok(runs.some((item) => item.commandId === "nav:runs"), "search matches command titles");
  assert.ok(
    filterCheatsheetCommandItems(items, "print").some((item) => item.commandId === "action:export-current-view"),
    "search matches command keywords/subtitles",
  );
  assert.equal(filterCheatsheetCommandItems(items, "zzzz-no-such-command").length, 0);

  const shortcuts = KEYBOARD_SHORTCUT_CHEATSHEET;
  assert.equal(filterKeyboardShortcuts(shortcuts, "").length, shortcuts.length);
  assert.ok(
    filterKeyboardShortcuts(shortcuts, "open details").some((shortcut) => shortcut.id === "open-run"),
    "shortcut search matches descriptions",
  );
  console.log("✓ testCheatsheetSearchFiltering");
}

function main() {
  testCheatsheetCatalog();
  testGroupShortcutsByCategory();
  testFormatShortcutKeys();
  testShouldToggleCheatsheet();
  testResolveGoNavigationShortcut();
  testIsTypingContext();
  testShouldHandleGlobalShortcut();
  testNoUnlistedCommands();
  testShortcutRoutesAreRegisteredCommands();
  testCheatsheetSearchFiltering();
  console.log("keyboard-shortcut-cheatsheet-utils.test.ts: all assertions passed");
}

main();
