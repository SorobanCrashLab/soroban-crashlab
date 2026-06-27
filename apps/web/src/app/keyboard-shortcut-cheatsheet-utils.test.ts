import * as assert from "node:assert/strict";
import {
  formatShortcutKeys,
  groupShortcutsByCategory,
  isTypingContext,
  KEYBOARD_SHORTCUT_CHEATSHEET,
  resolveGoNavigationShortcut,
  shouldHandleGlobalShortcut,
  shouldToggleCheatsheet,
  SHORTCUT_CATEGORY_ORDER,
} from "./keyboard-shortcut-cheatsheet-utils";

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

function main() {
  testCheatsheetCatalog();
  testGroupShortcutsByCategory();
  testFormatShortcutKeys();
  testShouldToggleCheatsheet();
  testResolveGoNavigationShortcut();
  testIsTypingContext();
  testShouldHandleGlobalShortcut();
  console.log("keyboard-shortcut-cheatsheet-utils.test.ts: all assertions passed");
}

main();
